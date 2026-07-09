import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ScreenReportActions from '../components/ScreenReportActions';
import { db, handleFirestoreError, OperationType, logAuditAction } from '../lib/firebase';
import { collection, getDocs, query, where, addDoc, setDoc, serverTimestamp, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button, buttonVariants } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import DateInput from '../components/DateInput';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { ConfirmDeleteDialog } from '../components/ui/confirm-delete-dialog';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CalendarPlus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay, parseISO, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, subMonths, addMonths, isSameMonth } from 'date-fns';
import { toast } from 'sonner';
import { useSettings } from '../contexts/SettingsContext';
import { hasClientPermission, normalizeClientRole } from '../lib/permissions';

const compressImage = (file: File, maxWidth = 200, maxHeight = 200): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

interface ProfileData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  createdAt: any;
  photoUrl?: string;
  phone?: string;
  address?: string;
  startDate?: string;
  notes?: string;
}

interface ShiftData {
  id: string;
  userId: string;
  startTime: string; // ISO
  endTime: string; // ISO
  notes?: string;
}

export default function Staff() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const canReadStaff = hasClientPermission(profile?.role, 'hr.read');
  const canManageStaff = hasClientPermission(profile?.role, 'hr.write');
  const canEditStaffRoles = ['super_admin', 'admin'].includes(normalizeClientRole(profile?.role));
  const [staff, setStaff] = useState<ProfileData[]>([]);
  const [shifts, setShifts] = useState<(ShiftData & { user?: ProfileData })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentDate, setCurrentDate] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  // Shift form
  const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftUserId, setShiftUserId] = useState('');
  const [shiftStartTime, setShiftStartTime] = useState('');
  const [shiftEndTime, setShiftEndTime] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftConflictMessage, setShiftConflictMessage] = useState('');

  // Bulk Shift form
  const [isBulkShiftDialogOpen, setIsBulkShiftDialogOpen] = useState(false);
  const [bulkShiftUserIds, setBulkShiftUserIds] = useState<string[]>([]);
  const [bulkShiftStartDate, setBulkShiftStartDate] = useState('');
  const [bulkShiftEndDate, setBulkShiftEndDate] = useState('');
  const [bulkShiftStartTime, setBulkShiftStartTime] = useState('');
  const [bulkShiftEndTime, setBulkShiftEndTime] = useState('');
  const [bulkShiftDays, setBulkShiftDays] = useState<number[]>([1,2,3,4,5]);
  const [bulkShiftNotes, setBulkShiftNotes] = useState('');

  useEffect(() => {
    if (!shiftUserId || !shiftStartTime || !shiftEndTime) {
      setShiftConflictMessage('');
      return;
    }
    const newStart = new Date(shiftStartTime).getTime();
    const newEnd = new Date(shiftEndTime).getTime();
    
    if (newStart >= newEnd) {
      setShiftConflictMessage('End time must be after start time.');
      return;
    }

    const hasConflict = shifts.some(shift => {
      if (editingShiftId && shift.id === editingShiftId) return false;
      if (shift.userId !== shiftUserId) return false;
      const existingStart = new Date(shift.startTime).getTime();
      const existingEnd = new Date(shift.endTime).getTime();
      return newStart < existingEnd && newEnd > existingStart;
    });

    if (hasConflict) {
      setShiftConflictMessage('Warning: This shift overlaps with an existing shift for this employee.');
      return;
    }

    // Calculate total weekly hours
    const weekStart = startOfWeek(new Date(shiftStartTime), { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    let weeklyHours = (newEnd - newStart) / (1000 * 60 * 60);
    shifts.forEach(shift => {
      if (editingShiftId && shift.id === editingShiftId) return;
      if (shift.userId !== shiftUserId) return;
      const existingStart = new Date(shift.startTime);
      const existingEnd = new Date(shift.endTime);
      if (existingStart >= weekStart && existingEnd <= weekEnd) {
        weeklyHours += (existingEnd.getTime() - existingStart.getTime()) / (1000 * 60 * 60);
      }
    });

    if (weeklyHours > 40) {
      setShiftConflictMessage(`Warning: Assigning this shift will exceed the 40 hours/week limit (Total: ${weeklyHours.toFixed(1)} hours).`);
    } else {
      setShiftConflictMessage('');
    }
  }, [shiftUserId, shiftStartTime, shiftEndTime, shifts, editingShiftId]);

  // Profile edit form
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editingRole, setEditingRole] = useState('');
  const [editingPhotoUrl, setEditingPhotoUrl] = useState('');
  const [editingFirstName, setEditingFirstName] = useState('');
  const [editingLastName, setEditingLastName] = useState('');
  const [editingEmail, setEditingEmail] = useState('');
  const [editingPassword, setEditingPassword] = useState('');
  const [editingPhone, setEditingPhone] = useState('');
  const [editingAddress, setEditingAddress] = useState('');
  const [editingStartDate, setEditingStartDate] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [editingDepartment, setEditingDepartment] = useState('');

  // Create employee form
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [empFirstName, setEmpFirstName] = useState('');
  const [empLastName, setEmpLastName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empAddress, setEmpAddress] = useState('');
  const [empStartDate, setEmpStartDate] = useState('');
  const [empRole, setEmpRole] = useState('trainer');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empPhotoUrl, setEmpPhotoUrl] = useState('');
  const [empNotes, setEmpNotes] = useState('');

  const fetchStaff = async () => {
    try {
      if (canReadStaff) {
        const rolesToFetch = settings?.staffRoles?.length ? settings.staffRoles : ['admin', 'manager', 'reception', 'cashier', 'trainer', 'accounting', 'warehouse_manager', 'hr', 'support'];
        // Firestore 'in' queries are limited to 10 elements. Slicing in case it exceeds.
        const q = query(collection(db, 'users'), where('role', 'in', rolesToFetch.slice(0, 10)));
        const sn = await getDocs(q);
        const data: ProfileData[] = [];
        sn.forEach(doc => {
          data.push({ id: doc.id, ...(doc.data() as Record<string, any>) } as ProfileData);
        });
        setStaff(data);
        return data;
      } else if (profile) {
        const data = [profile];
        setStaff(data as ProfileData[]);
        return data as ProfileData[];
      }
      return [];
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'users');
      return [];
    }
  };

  const fetchShifts = async (staffData: ProfileData[]) => {
    try {
      let q;
      if (canReadStaff) {
        q = query(collection(db, 'shifts'));
      } else if (profile?.id) {
        q = query(collection(db, 'shifts'), where('userId', '==', profile.id));
      } else {
        setShifts([]);
        return;
      }
      
      const sn = await getDocs(q);
      const data: (ShiftData & { user?: ProfileData })[] = [];
      sn.forEach(doc => {
        const payload = { id: doc.id, ...(doc.data() as Record<string, any>) } as ShiftData;
        const user = staffData.find(u => u.id === payload.userId);
        data.push({ ...payload, user });
      });
      setShifts(data.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'shifts');
    }
  };

  const loadData = async () => {
    setLoading(true);
    const staffData = await fetchStaff();
    await fetchShifts(staffData);
    setLoading(false);
  };

  useEffect(() => {
    if (profile) {
      loadData();
    }
  }, [profile?.id, profile?.role]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empEmail || !empFirstName || !empLastName || !empPassword) return;

    try {
      // Mock secondary app user creation since we removed firebase/auth
      const newUserId = `staff-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      const docRef = doc(db, 'users', newUserId);
      await setDoc(docRef, {
        email: empEmail,
        firstName: empFirstName,
        lastName: empLastName,
        role: empRole,
        department: empDepartment || '',
        phone: empPhone || '',
        address: empAddress || '',
        startDate: empStartDate || '',
        photoUrl: empPhotoUrl || '',
        notes: empNotes || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAuditAction('CREATE_EMPLOYEE', newUserId, `Created employee ${empFirstName} ${empLastName} with role ${empRole}`);
      toast.success('Employee profile created');
      setIsEmployeeDialogOpen(false);
      setEmpFirstName('');
      setEmpLastName('');
      setEmpEmail('');
      setEmpPassword('');
      setEmpPhone('');
      setEmpAddress('');
      setEmpStartDate('');
      setEmpRole('trainer');
      setEmpDepartment('');
      setEmpPhotoUrl('');
      setEmpNotes('');
      loadData();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
      toast.error('Failed to create employee');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setEmpPhotoUrl(compressed);
    } catch (error) {
      toast.error('Failed to process image');
    }
  };

  const handleEditProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId || !editingRole) return;
    
    try {
      const userRef = doc(db, 'users', editingUserId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
         const data = userDoc.data();
         await updateDoc(userRef, {
           firstName: editingFirstName,
           lastName: editingLastName,
           phone: editingPhone,
           address: editingAddress,
           startDate: editingStartDate,
           notes: editingNotes,
           role: editingRole,
           department: editingDepartment || '',
           photoUrl: editingPhotoUrl,
           updatedAt: serverTimestamp(),
           createdAt: data.createdAt,
           email: data.email
         });

         if (editingPassword) {
           toast.info('Password update requires backend integration. Profile data was saved.');
         }
         
         let logMsg = `Updated profile for ${editingFirstName} ${editingLastName}`;
         let actionType = 'UPDATE_EMPLOYEE';
         if (editingRole === 'client' && data.role !== 'client') {
             logMsg = `Revoked staff access for ${editingFirstName} ${editingLastName} (changed role from ${data.role} to Client)`;
             actionType = 'REVOKE_STAFF_ACCESS';
         } else if (editingRole !== data.role) {
             logMsg = `Updated profile and changed role from ${data.role} to ${editingRole} for ${editingFirstName} ${editingLastName}`;
         }
         await logAuditAction(actionType, editingUserId, logMsg);
         toast.success('Profile updated successfully');
         setIsEditDialogOpen(false);
         loadData();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUserId}`);
      toast.error('Failed to update profile');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        await updateDoc(userRef, {
          role: newRole,
          updatedAt: serverTimestamp(),
          createdAt: data.createdAt,
          email: data.email
        });
        let logMsg = `Changed role from ${data.role} to ${newRole}`;
        let actionType = 'UPDATE_ROLE';
        if (newRole === 'client' && data.role !== 'client') {
          logMsg = `Revoked staff access (changed role from ${data.role} to Client)`;
          actionType = 'REVOKE_STAFF_ACCESS';
        }
        await logAuditAction(actionType, userId, logMsg);
        toast.success(`Role updated to ${newRole}`);
        loadData();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      toast.error('Failed to update role');
    }
  };

  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setEditingPhotoUrl(compressed);
    } catch (error) {
      toast.error('Failed to process image');
    }
  };

  const openEditShift = (shift: ShiftData) => {
    setEditingShiftId(shift.id);
    setShiftUserId(shift.userId);
    setShiftStartTime(format(new Date(shift.startTime), "yyyy-MM-dd'T'HH:mm"));
    setShiftEndTime(format(new Date(shift.endTime), "yyyy-MM-dd'T'HH:mm"));
    setShiftNotes(shift.notes || '');
    setIsShiftDialogOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftUserId || !shiftStartTime || !shiftEndTime) return;
    
    if (new Date(shiftStartTime).getTime() >= new Date(shiftEndTime).getTime()) {
      toast.error('End time must be after start time.');
      return;
    }

    try {
      if (editingShiftId) {
        await updateDoc(doc(db, 'shifts', editingShiftId), {
          userId: shiftUserId,
          startTime: new Date(shiftStartTime).toISOString(),
          endTime: new Date(shiftEndTime).toISOString(),
          notes: shiftNotes,
          updatedAt: serverTimestamp(),
        });
        toast.success('Shift updated successfully');
      } else {
        await addDoc(collection(db, 'shifts'), {
          userId: shiftUserId,
          startTime: new Date(shiftStartTime).toISOString(),
          endTime: new Date(shiftEndTime).toISOString(),
          notes: shiftNotes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success('Shift created successfully');
      }
      setIsShiftDialogOpen(false);
      setEditingShiftId(null);
      setShiftUserId('');
      setShiftStartTime('');
      setShiftEndTime('');
      setShiftNotes('');
      loadData();
    } catch (error) {
      handleFirestoreError(error, editingShiftId ? OperationType.UPDATE : OperationType.CREATE, 'shifts');
      toast.error(editingShiftId ? 'Failed to update shift' : 'Failed to create shift');
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    try {
      await deleteDoc(doc(db, 'shifts', shiftId));
      toast.success('Shift deleted successfully');
      loadData();
      setIsShiftDialogOpen(false);
      setEditingShiftId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'shifts');
      toast.error('Failed to delete shift');
    }
  };

  const handleDeleteProfile = async (userId: string) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
      toast.success('Profile deleted successfully');
      loadData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users');
      toast.error('Failed to delete profile');
    }
  };

  const handleCreateBulkShifts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkShiftUserIds.length === 0 || !bulkShiftStartDate || !bulkShiftEndDate || !bulkShiftStartTime || !bulkShiftEndTime) {
      toast.error('Please fill in all required fields and select at least one staff member.');
      return;
    }

    const startD = new Date(bulkShiftStartDate);
    const endD = new Date(bulkShiftEndDate);
    if (startD > endD) {
      toast.error('End date must be after start date.');
      return;
    }

    // Generate dates based on start and end date and selected days of week
    const datesToSchedule: Date[] = [];
    const current = new Date(startD);
    while (current <= endD) {
      // 0 = Sunday, 1 = Monday, ... 6 = Saturday in JavaScript Date
      // The array has [1,2,3,4,5] which maps to Mon-Fri (assuming 0 is Sunday, which it is)
      if (bulkShiftDays.includes(current.getDay())) {
        datesToSchedule.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    if (datesToSchedule.length === 0) {
      toast.error('No dates match the selected days of the week in the given date range.');
      return;
    }

    try {
      const dbPromises = [];
      const timestamp = serverTimestamp();
      
      for (const date of datesToSchedule) {
        const dStr = format(date, 'yyyy-MM-dd');
        const shiftStart = new Date(`${dStr}T${bulkShiftStartTime}`).toISOString();
        const shiftEndObj = new Date(`${dStr}T${bulkShiftEndTime}`);
        
        // Handle overnight shifts? Just basic for now:
        if (shiftEndObj < new Date(`${dStr}T${bulkShiftStartTime}`)) {
          shiftEndObj.setDate(shiftEndObj.getDate() + 1);
        }
        const shiftEnd = shiftEndObj.toISOString();

        for (const uId of bulkShiftUserIds) {
          dbPromises.push(addDoc(collection(db, 'shifts'), {
            userId: uId,
            startTime: shiftStart,
            endTime: shiftEnd,
            notes: bulkShiftNotes,
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
        }
      }

      await Promise.all(dbPromises);
      toast.success(`Successfully created ${dbPromises.length} shifts.`);
      setIsBulkShiftDialogOpen(false);
      setBulkShiftUserIds([]);
      setBulkShiftStartDate('');
      setBulkShiftEndDate('');
      setBulkShiftStartTime('');
      setBulkShiftEndTime('');
      setBulkShiftDays([1,2,3,4,5]);
      setBulkShiftNotes('');
      loadData();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'shifts');
      toast.error('Failed to create bulk shifts');
    }
  };

  const openProfileEdit = (user: ProfileData) => {
    setEditingUserId(user.id);
    setEditingRole(user.role);
    setEditingDepartment(user.department || '');
    setEditingPhotoUrl(user.photoUrl || '');
    setEditingFirstName(user.firstName || '');
    setEditingLastName(user.lastName || '');
    setEditingEmail(user.email || '');
    setEditingPassword('');
    setEditingPhone(user.phone || '');
    setEditingAddress(user.address || '');
    setEditingStartDate(user.startDate || '');
    setEditingNotes(user.notes || '');
    setIsEditDialogOpen(true);
  };

  const filteredStaff = staff.filter(member => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      member.firstName?.toLowerCase().includes(q) ||
      member.lastName?.toLowerCase().includes(q) ||
      member.role?.toLowerCase().includes(q) ||
      member.department?.toLowerCase().includes(q) ||
      member.phone?.toLowerCase().includes(q);
      
    const matchesRole = roleFilter === 'all' || member.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const filteredShifts = shifts.filter(shift => {
    const q = searchTerm.toLowerCase();
    const firstName = (shift.user?.firstName || '').toLowerCase();
    const lastName = (shift.user?.lastName || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();
    const role = (shift.user?.role || '').toLowerCase();
    const department = (shift.user?.department || '').toLowerCase();
    const notes = (shift.notes || '').toLowerCase();
    
    const matchesSearch = !searchTerm || (
      fullName.includes(q) || 
      firstName.includes(q) || 
      lastName.includes(q) ||
      role.includes(q) ||
      department.includes(q) ||
      notes.includes(q)
    );
    
    const matchesRole = roleFilter === 'all' || shift.user?.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Staff Management</h1>
          <p className="text-slate-500 mt-1">Manage employee profiles and scheduling.</p>
        </div>
        {canManageStaff && (
          <>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setIsEmployeeDialogOpen(true)}>
              Add Employee
            </Button>
            <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Employee Profile</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEmployee} className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto px-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={empFirstName} onChange={(e) => setEmpFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={empLastName} onChange={(e) => setEmpLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={empPassword} onChange={(e) => setEmpPassword(e.target.value)} required minLength={6} placeholder="Min. 6 characters" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <DateInput value={empStartDate} onChange={(v) => setEmpStartDate(v)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={empAddress} onChange={(e) => setEmpAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={empRole} onValueChange={setEmpRole} items={settings?.staffRoles.map(r => ({ value: r, label: (r.charAt(0).toUpperCase() + r.slice(1)) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings?.staffRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={empDepartment} onValueChange={setEmpDepartment} items={settings?.departments.map(d => ({ value: d, label: d }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings?.departments.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Photo (Optional)</Label>
                <Input type="file" accept="image/*" onChange={handlePhotoUpload} />
                {empPhotoUrl && (
                   <Avatar className="h-16 w-16 mt-2">
                     <AvatarImage src={empPhotoUrl} />
                   </Avatar>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea value={empNotes} onChange={(e) => setEmpNotes(e.target.value)} placeholder="Add any background or employee notes..." />
              </div>
              <Button type="submit" className="w-full">Create Employee</Button>
            </form>
          </DialogContent>
        </Dialog>
        </>
        )}
      </div>

      <ScreenReportActions
        reportIds={['staff-users']}
        title="Staff screen PDFs"
        description="Generate staff-user reports using role-aware access from the staff screen."
      />

      <Tabs defaultValue={canReadStaff ? "staff" : "schedule"} className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 flex-wrap">
          <TabsList>
            {canReadStaff && <TabsTrigger value="staff">Staff Members</TabsTrigger>}
            <TabsTrigger value="schedule">Shift Schedule</TabsTrigger>
          </TabsList>
          
          <div className="flex flex-1 sm:justify-end gap-2 w-full sm:w-auto flex-col sm:flex-row">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-white">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {settings?.staffRoles?.map(role => (
                  <SelectItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input 
              placeholder="Search staff, phone, role, or shifts by name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-[280px]"
            />
          </div>
        </div>

        {canReadStaff && (
        <TabsContent value="staff">
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-600">Employee</TableHead>
                    <TableHead className="font-semibold text-slate-600">Contact</TableHead>
                    <TableHead className="font-semibold text-slate-600">Role</TableHead>
                    <TableHead className="font-semibold text-slate-600">Department</TableHead>
                    <TableHead className="font-semibold text-slate-600">Start Date</TableHead>
                    <TableHead className="text-right font-semibold text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading...</TableCell>
                    </TableRow>
                  ) : filteredStaff.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">No staff found</TableCell>
                    </TableRow>
                  ) : (
                    filteredStaff.map((member) => (
                      <TableRow key={member.id} className="hover:bg-slate-50/50">
                        <TableCell className="py-4">
                          <div className="flex items-center space-x-4">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={member.photoUrl} />
                              <AvatarFallback className="bg-indigo-100 text-indigo-700">
                                {member.firstName.charAt(0)}{member.lastName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{member.firstName} {member.lastName}</p>
                              <p className="text-xs text-slate-500">{member.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col space-y-1">
                            {member.phone ? (
                              <div className="text-sm text-slate-700 flex items-center">
                                <span className="block truncate">{member.phone}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">No phone</span>
                            )}
                            {member.address ? (
                              <div className="text-xs text-slate-500 flex items-center">
                                <span className="block truncate max-w-[150px]" title={member.address}>{member.address}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">No address</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {canEditStaffRoles ? (
                            <Select value={member.role} onValueChange={(val) => handleRoleChange(member.id, val)} items={[{value: "client", label: "Client"}, ...(settings?.staffRoles || []).map(r => ({value: r, label: r}))]}>
                              <SelectTrigger className="w-[140px] h-8 text-xs capitalize">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="client">Client</SelectItem>
                                {settings?.staffRoles.map(r => (
                                  <SelectItem key={r} value={r}>
                                    {r.charAt(0).toUpperCase() + r.slice(1)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="secondary" className="capitalize">
                              {member.role}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.department ? (
                            <Badge variant="outline">{member.department}</Badge>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {member.startDate ? format(new Date(member.startDate), 'dd/MM/yyyy') : member.createdAt?.toDate ? format(member.createdAt.toDate(), 'dd/MM/yyyy') : 'Unknown'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {canManageStaff ? (
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openProfileEdit(member)} title="Edit Profile">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <ConfirmDeleteDialog 
                                onConfirm={() => handleDeleteProfile(member.id)}
                                trigger={
                                  <button type="button" className={buttonVariants({ variant: "outline", size: "sm", className: "text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer appearance-none bg-transparent border-[1px]" })} title="Delete Profile">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                }
                              />
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => openProfileEdit(member)} title="View Profile">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value="schedule">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Upcoming Shifts</CardTitle>
              {canManageStaff && (
                <div className="flex space-x-2">
                  <Button size="sm" variant="outline" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1" onClick={() => setIsBulkShiftDialogOpen(true)}>
                    <CalendarPlus className="w-4 h-4" /> Bulk Assign
                  </Button>
                  <Dialog open={isBulkShiftDialogOpen} onOpenChange={setIsBulkShiftDialogOpen}>
                    <DialogContent className="max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Bulk Assign Shifts</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateBulkShifts} className="space-y-4 pt-4 max-h-[80vh] overflow-y-auto px-1">
                        <div className="space-y-2">
                          <Label>Select Employees</Label>
                          <div className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-40 overflow-y-auto bg-slate-50">
                            {staff.map(s => (
                              <div key={s.id} className="flex items-center space-x-2">
                                <Input 
                                  type="checkbox" 
                                  id={`bulk-user-${s.id}`} 
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                                  checked={bulkShiftUserIds.includes(s.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setBulkShiftUserIds(prev => [...prev, s.id]);
                                    else setBulkShiftUserIds(prev => prev.filter(id => id !== s.id));
                                  }}
                                />
                                <label htmlFor={`bulk-user-${s.id}`} className="text-sm cursor-pointer">{s.firstName} {s.lastName}</label>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Start Date</Label>
                            <DateInput value={bulkShiftStartDate} onChange={v => setBulkShiftStartDate(v)} required />
                          </div>
                          <div className="space-y-2">
                            <Label>End Date</Label>
                            <DateInput value={bulkShiftEndDate} onChange={v => setBulkShiftEndDate(v)} required />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Start Time</Label>
                            <Input type="time" value={bulkShiftStartTime} onChange={e => setBulkShiftStartTime(e.target.value)} required />
                          </div>
                          <div className="space-y-2">
                            <Label>End Time</Label>
                            <Input type="time" value={bulkShiftEndTime} onChange={e => setBulkShiftEndTime(e.target.value)} required />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Days of the Week</Label>
                          <div className="flex flex-wrap gap-2">
                            {[ 
                              { val: 1, label: 'Mon' }, { val: 2, label: 'Tue' }, { val: 3, label: 'Wed' },
                              { val: 4, label: 'Thu' }, { val: 5, label: 'Fri' }, { val: 6, label: 'Sat' },
                              { val: 0, label: 'Sun' }
                            ].map(day => (
                              <div key={day.val} className="flex items-center space-x-1 border rounded px-2 py-1 bg-white cursor-pointer hover:bg-slate-50" onClick={() => {
                                setBulkShiftDays(prev => prev.includes(day.val) ? prev.filter(d => d !== day.val) : [...prev, day.val])
                              }}>
                                <Input 
                                  type="checkbox" 
                                  className="w-3 h-3" 
                                  checked={bulkShiftDays.includes(day.val)}
                                  onChange={() => {}} 
                                />
                                <label className="text-xs cursor-pointer">{day.label}</label>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Notes (Optional)</Label>
                          <Textarea value={bulkShiftNotes} onChange={(e) => setBulkShiftNotes(e.target.value)} placeholder="e.g. Regular shift hours" />
                        </div>
                        
                        <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">Create Shifts</Button>
                      </form>
                    </DialogContent>
                  </Dialog>

                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setEditingShiftId(null); setIsShiftDialogOpen(true); }}>
                    Assign Shift
                  </Button>
                  <Dialog open={isShiftDialogOpen} onOpenChange={(open) => {
                    if (!open) {
                      setIsShiftDialogOpen(false);
                      setEditingShiftId(null);
                      setShiftUserId('');
                      setShiftStartTime('');
                      setShiftEndTime('');
                      setShiftNotes('');
                    } else {
                      setIsShiftDialogOpen(true);
                    }
                  }}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingShiftId ? 'Edit Shift' : 'Assign New Shift'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleSaveShift} className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Employee</Label>
                        <Select value={shiftUserId} onValueChange={setShiftUserId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select staff...">
                              {(val: any) => {
                                const s = staff.find(st => st.id === val);
                                return s ? `${s.firstName} ${s.lastName} (${s.role})` : <span className="text-slate-400">Select staff...</span>;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {staff.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Start</Label>
                          <Input type="datetime-local" value={shiftStartTime} onChange={(e) => setShiftStartTime(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label>End</Label>
                          <Input type="datetime-local" value={shiftEndTime} onChange={(e) => setShiftEndTime(e.target.value)} required />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes (Optional)</Label>
                        <Textarea value={shiftNotes} onChange={(e) => setShiftNotes(e.target.value)} placeholder="e.g. Closing duties" />
                      </div>
                      {shiftConflictMessage && (
                        <div className={`p-3 rounded-md text-sm flex items-start gap-2 ${shiftConflictMessage.startsWith('Warning') ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div>{shiftConflictMessage}</div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {editingShiftId && (
                          <ConfirmDeleteDialog 
                            onConfirm={() => handleDeleteShift(editingShiftId)}
                            trigger={
                              <button type="button" className={buttonVariants({ variant: "destructive", className: "w-full cursor-pointer appearance-none border-none" })}>
                                Delete
                              </button>
                            }
                          />
                        )}
                        <Button type="submit" className="w-full" disabled={shiftConflictMessage.startsWith('End time')}>Save Shift</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-slate-500">Loading...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="icon" onClick={() => setCurrentDate(prev => viewMode === 'month' ? subMonths(prev, 1) : subWeeks(prev, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setCurrentDate(prev => viewMode === 'month' ? addMonths(prev, 1) : addWeeks(prev, 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setCurrentDate(viewMode === 'month' ? startOfMonth(new Date()) : startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                        Today
                      </Button>
                      <div className="ml-4 font-semibold text-slate-800 flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-2 text-indigo-500" />
                        {viewMode === 'month' 
                          ? format(currentDate, 'MMMM yyyy') 
                          : `${format(currentDate, 'dd/MM/yyyy')} - ${format(addDays(currentDate, 6), 'dd/MM/yyyy')}`}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex bg-slate-100 rounded-md p-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`h-8 px-3 ${viewMode === 'week' ? 'bg-white shadow-sm' : ''}`}
                          onClick={() => {
                            setViewMode('week');
                            setCurrentDate(startOfWeek(currentDate, { weekStartsOn: 1 }));
                          }}
                        >
                          Week
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`h-8 px-3 ${viewMode === 'month' ? 'bg-white shadow-sm' : ''}`}
                          onClick={() => {
                            setViewMode('month');
                            setCurrentDate(startOfMonth(currentDate));
                          }}
                        >
                          Month
                        </Button>
                      </div>
                      
                      {viewMode === 'week' && (
                        <Select value={selectedDayFilter} onValueChange={setSelectedDayFilter} items={[{value: 'all', label: 'Entire Week'}, ...Array.from({length: 7}).map((_, i) => ({value: i.toString(), label: format(addDays(currentDate, i), 'EEEE')}))]}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Entire Week</SelectItem>
                            {Array.from({ length: 7 }).map((_, i) => (
                              <SelectItem key={i.toString()} value={i.toString()}>{format(addDays(currentDate, i), 'EEEE')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>

                  {viewMode === 'week' ? (
                    <div className={`grid gap-4 ${selectedDayFilter === 'all' ? 'grid-cols-1 md:grid-cols-7' : 'grid-cols-1 max-w-sm mx-auto'}`}>
                      {Array.from({ length: 7 }).map((_, i) => {
                        if (selectedDayFilter !== 'all' && parseInt(selectedDayFilter) !== i) return null;
                        
                        const date = addDays(currentDate, i);
                        const dayShifts = filteredShifts.filter(s => isSameDay(new Date(s.startTime), date));
                        const isToday = isSameDay(date, new Date());
                        
                        return (
                          <div key={i} className={`flex flex-col border rounded-lg overflow-hidden ${isToday ? 'border-indigo-300 ring-1 ring-indigo-300' : 'border-slate-200'}`}>
                            <div className={`p-2 text-center text-sm font-medium ${isToday ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-700'} border-b border-slate-100`}>
                              <div>{format(date, 'EEEE')}</div>
                              <div className="text-xs text-slate-500 font-normal">{format(date, 'dd/MM/yyyy')}</div>
                            </div>
                            <div className="p-2 space-y-2 min-h-[120px] bg-white">
                              {dayShifts.map(shift => (
                                <div 
                                  key={shift.id} 
                                  className={`p-2 rounded bg-indigo-50 border border-indigo-100 text-xs shadow-sm flex flex-col gap-1 transition-all hover:ring-1 hover:ring-indigo-300 ${canManageStaff ? 'cursor-pointer hover:bg-indigo-100' : ''}`}
                                  onClick={() => {
                                    if (canManageStaff) openEditShift(shift);
                                  }}
                                >
                                  <div className="font-semibold text-indigo-900 line-clamp-1">
                                    {shift.user?.firstName} {shift.user?.lastName}
                                  </div>
                                  <div className="text-indigo-700 font-medium">
                                    {format(new Date(shift.startTime), 'h:mm a')} - {format(new Date(shift.endTime), 'h:mm a')}
                                  </div>
                                  {shift.notes && (
                                    <div className="text-indigo-600/80 line-clamp-2" title={shift.notes}>
                                      {shift.notes}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {dayShifts.length === 0 && (
                                <div className="text-center text-slate-400 text-xs italic py-4">No shifts</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 text-center text-sm font-medium text-slate-700">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                          <div key={day} className="p-2">{day}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 auto-rows-fr">
                        {(() => {
                          const monthStart = startOfMonth(currentDate);
                          const monthEnd = endOfMonth(currentDate);
                          const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
                          const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
                          const days = eachDayOfInterval({ start: startDate, end: endDate });
                          
                          return days.map((date, i) => {
                            const isCurrentMonth = isSameMonth(date, currentDate);
                            const isToday = isSameDay(date, new Date());
                            const dayShifts = filteredShifts.filter(s => isSameDay(new Date(s.startTime), date));
                            
                            return (
                              <div 
                                key={date.toISOString()} 
                                className={`min-h-[100px] p-1 border-r border-b border-slate-100 ${!isCurrentMonth ? 'bg-slate-50/50' : 'bg-white'} ${isToday ? 'bg-indigo-50/30' : ''}`}
                              >
                                <div className={`text-right text-xs p-1 ${isToday ? 'font-bold text-indigo-600' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                                  {format(date, 'd')}
                                </div>
                                <div className="space-y-1 mt-1 max-h-[80px] overflow-y-auto no-scrollbar">
                                  {dayShifts.map(shift => (
                                    <div 
                                      key={shift.id} 
                                      className={`px-1 py-0.5 rounded text-[10px] leading-tight cursor-pointer truncate ${canManageStaff ? 'hover:ring-1 ring-indigo-300' : ''} bg-indigo-100 text-indigo-800`}
                                      onClick={() => {
                                        if (canManageStaff) openEditShift(shift);
                                      }}
                                    >
                                      <span className="font-semibold">{format(new Date(shift.startTime), 'HH:mm')}</span> {shift.user?.firstName}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Profile Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee Profile</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditProfile} className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={editingFirstName} onChange={(e) => setEditingFirstName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={editingLastName} onChange={(e) => setEditingLastName(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={editingEmail} readOnly disabled className="bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label>New Password (Optional)</Label>
              <Input type="password" value={editingPassword} onChange={(e) => setEditingPassword(e.target.value)} placeholder="Leave blank to keep current" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input type="tel" value={editingPhone} onChange={(e) => setEditingPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DateInput value={editingStartDate} onChange={(v) => setEditingStartDate(v)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={editingAddress} onChange={(e) => setEditingAddress(e.target.value)} placeholder="Full address" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editingRole} onValueChange={setEditingRole} disabled={!canEditStaffRoles} items={[{value: 'client', label: 'Client (Revoke access)'}, ...(settings?.staffRoles || []).map(r => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))]}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client (Revoke access)</SelectItem>
                  {settings?.staffRoles.map(r => (
                    <SelectItem key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={editingDepartment} onValueChange={setEditingDepartment} items={settings?.departments.map(d => ({ value: d, label: d }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {settings?.departments.map(d => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Photo (Optional)</Label>
              <Input type="file" accept="image/*" onChange={handleEditPhotoUpload} />
              {editingPhotoUrl && (
                 <Avatar className="h-16 w-16 mt-2">
                   <AvatarImage src={editingPhotoUrl} />
                 </Avatar>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!canManageStaff && editingRole !== staff.find(s => s.id === editingUserId)?.role}>Update Profile</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
