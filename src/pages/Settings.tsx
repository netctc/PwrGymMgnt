import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import DateInput from '../components/DateInput';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { toast } from 'sonner';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Database, Server, Activity, ShieldAlert, CheckCircle2, Download, Play, AlertTriangle, Trash2, Image as ImageIcon, KeyRound, UserCog, PlusCircle, RefreshCcw } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import ScreenReportActions from '../components/ScreenReportActions';

function DatabaseBackup({ activeTab }: { activeTab: string }) {
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [selectedBackups, setSelectedBackups] = useState<Set<string>>(new Set());
  const [restoreInspection, setRestoreInspection] = useState<any>(null);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
      }
    } catch (err) {
      console.error('Failed to load backups');
    } finally {
      setBackupsLoading(false);
    }
  };

  const triggerBackup = async () => {
    toast.info("Triggering database backup...");
    try {
      const res = await fetch('/api/trigger-backup', { method: 'POST' });
      if (res.ok) {
        toast.success("Database backup completed successfully.");
        loadBackups();
      } else {
        toast.error("Failed to trigger backup.");
      }
    } catch (err) {
      toast.error("Network error triggering backup.");
    }
  };

  const deleteSelectedBackups = async () => {
    if (selectedBackups.size === 0) return;
    try {
      const res = await fetch('/api/backups/delete', {
        method: 'POST',
        headers: {
           'Content-Type': 'application/json'
        },
        body: JSON.stringify({ files: Array.from(selectedBackups) })
      });
      if (res.ok) {
        toast.success(`Deleted ${selectedBackups.size} backup(s).`);
        setSelectedBackups(new Set());
        loadBackups();
      } else {
        toast.error("Failed to delete backups.");
      }
    } catch (err) {
      toast.error("Network error deleting backups.");
    }
  };

  const inspectBackup = async (name: string) => {
    setRestoreLoading(name);
    try {
      const res = await fetch(`/api/platform/backups/restore/backups/${encodeURIComponent(name)}/inspect`);
      if (!res.ok) throw new Error('Backup inspection failed');
      const data = await res.json();
      setRestoreInspection(data);
      if (data.inspection?.ok) toast.success('Backup inspection completed.');
      else toast.error('Backup inspection found blockers.');
    } catch (err) {
      console.error('Backup inspection failed', err);
      toast.error('Backup inspection failed.');
    } finally {
      setRestoreLoading(null);
    }
  };

  const dryRunRestore = async (name: string) => {
    setRestoreLoading(name);
    try {
      const res = await fetch('/api/platform/backups/restore/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, apply: false }),
      });
      if (!res.ok) throw new Error('Restore dry-run failed');
      const data = await res.json();
      setRestoreInspection(data);
      const blockers = data.plan?.blockers?.length || 0;
      if (blockers > 0) toast.warning(`Restore dry-run completed with ${blockers} blocker(s).`);
      else toast.success('Restore dry-run completed. Backup can be restored from CLI or enabled API apply mode.');
    } catch (err) {
      console.error('Restore dry-run failed', err);
      toast.error('Restore dry-run failed.');
    } finally {
      setRestoreLoading(null);
    }
  };

  const toggleSelection = (name: string) => {
    const newSelected = new Set(selectedBackups);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedBackups(newSelected);
  };

  const toggleAll = () => {
    if (selectedBackups.size === backups.length) {
      setSelectedBackups(new Set());
    } else {
      setSelectedBackups(new Set(backups.map(b => b.name)));
    }
  };

  useEffect(() => {
    if (activeTab === 'maintenance') {
      loadBackups();
    }
  }, [activeTab]);

  // Aggregate sizes by day (last 30 days) for chart
  const last30Days = Array.from({ length: 30 }).map((_, i) => format(subDays(new Date(), i), 'dd/MM')).reverse();
  const backupChartData = last30Days.map(date => ({ name: date, sizeMB: 0 }));

  backups.forEach(b => {
    const dateStr = format(new Date(b.createdAt), 'dd/MM');
    const dayData = backupChartData.find(d => d.name === dateStr);
    if (dayData) {
      dayData.sizeMB += b.size / (1024 * 1024);
    }
  });

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle>Database Backups</CardTitle>
          <CardDescription>Manage daily automated backups and perform manual exports to secure your system data.</CardDescription>
        </div>
        <div className="flex gap-2">
          {selectedBackups.size > 0 && (
            <Button onClick={deleteSelectedBackups} variant="destructive" className="whitespace-nowrap flex items-center">
              <Trash2 className="w-4 h-4 mr-2" /> Delete Selected ({selectedBackups.size})
            </Button>
          )}
          <Button onClick={triggerBackup} className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap">
            <Play className="w-4 h-4 mr-2" /> Trigger Manual Backup
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {backups.length > 0 && (
          <div className="h-[200px] w-full mb-8 pt-4 pb-2 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">Storage Usage (Last 30 Days)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={backupChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} minTickGap={30} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `${val.toFixed(1)} MB`} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [`${value.toFixed(2)} MB`, 'Total Size']} />
                <Area type="monotone" dataKey="sizeMB" stroke="#6366f1" fillOpacity={1} fill="url(#colorSize)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="border rounded-md max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <input type="checkbox" checked={selectedBackups.size === backups.length && backups.length > 0} onChange={toggleAll} className="rounded border-slate-300" />
                </TableHead>
                <TableHead>Backup File Name</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead className="text-right">File Size</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backupsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500">Loading backups...</TableCell>
                </TableRow>
              ) : backups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500 italic">No database backups found.</TableCell>
                </TableRow>
              ) : (
                backups.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-center">
                      <input type="checkbox" checked={selectedBackups.has(b.name)} onChange={() => toggleSelection(b.name)} className="rounded border-slate-300" />
                    </TableCell>
                    <TableCell className="font-mono text-sm text-indigo-600 font-medium">{b.name}</TableCell>
                    <TableCell>{format(new Date(b.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell className="text-right text-slate-500">{(b.size / 1024).toFixed(1)} KB</TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                       <div className="flex justify-end gap-1">
                         <Button size="sm" variant="ghost" className="text-slate-500 hover:text-indigo-600" onClick={() => inspectBackup(b.name)} disabled={restoreLoading === b.name}>Inspect</Button>
                         <Button size="sm" variant="ghost" className="text-slate-500 hover:text-amber-600" onClick={() => dryRunRestore(b.name)} disabled={restoreLoading === b.name}>Dry-run</Button>
                         <Button size="sm" variant="ghost" className="text-slate-500 hover:text-indigo-600" asChild>
                           <a href={`/api/backups/download/${b.name}`} download>
                             <Download className="w-4 h-4" />
                           </a>
                         </Button>
                       </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {restoreInspection && (
          <div className="mt-6 rounded-lg border bg-slate-50 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className={`w-5 h-5 mt-0.5 ${restoreInspection.inspection?.ok ? 'text-emerald-600' : 'text-red-600'}`} />
              <div className="flex-1">
                <p className="font-semibold text-slate-900">Restore inspection: {restoreInspection.backup?.name}</p>
                <p className="text-sm text-slate-600">
                  Size: {((restoreInspection.inspection?.metrics?.sizeBytes || 0) / 1024).toFixed(1)} KB ·
                  Tables: {restoreInspection.inspection?.metrics?.createTableCount || 0} create, {restoreInspection.inspection?.metrics?.insertCount || 0} insert statement(s) ·
                  Destructive statements: {restoreInspection.inspection?.metrics?.destructiveStatementCount || 0}
                </p>
                <p className="text-xs text-slate-500 font-mono truncate mt-1">SHA-256: {restoreInspection.inspection?.metrics?.sha256 || '-'}</p>
              </div>
            </div>
            {(restoreInspection.inspection?.errors || []).map((message: string) => (
              <div key={message} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>
            ))}
            {(restoreInspection.plan?.blockers || []).map((message: string) => (
              <div key={message} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Blocker: {message}</div>
            ))}
            {(restoreInspection.inspection?.warnings || []).map((message: string) => (
              <div key={message} className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Warning: {message}</div>
            ))}
            <p className="text-xs text-slate-500">Apply mode is intentionally blocked from the UI unless the backend is explicitly configured. Use the CLI during a maintenance window after taking a fresh backup.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function DataIntegrityPanel({ activeTab }: { activeTab: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/platform/data-integrity/overview');
      if (!res.ok) throw new Error('Data integrity endpoint failed');
      setOverview(await res.json());
    } catch (error) {
      console.error('Failed to load data integrity overview', error);
      toast.error('Failed to load data integrity diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  const runRepairDryRun = async (repairId: string) => {
    setRepairing(repairId);
    try {
      const res = await fetch(`/api/platform/data-integrity/repairs/${repairId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Repair dry-run failed');
      const data = await res.json();
      const affected = data?.repair?.affectedRows ?? 0;
      toast.info(`Dry-run complete: ${affected} row(s) would be updated.`);
    } catch (error) {
      console.error('Data repair dry-run failed', error);
      toast.error('Data repair dry-run failed.');
    } finally {
      setRepairing(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'maintenance') {
      loadOverview();
    }
  }, [activeTab]);

  const summary = overview?.summary || {};
  const findings = overview?.findings || [];
  const failingFindings = findings.filter((finding: any) => finding.status === 'fail');

  return (
    <Card>
      <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> Data Integrity Center</CardTitle>
          <CardDescription>Non-destructive database diagnostics for orphan records, inconsistent statuses, expired active tokens, and reporting risks.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadOverview} disabled={loading}>{loading ? 'Scanning...' : 'Run Scan'}</Button>
          <Button variant="outline" asChild>
            <a href="/api/platform/data-integrity/overview.csv" download><Download className="w-4 h-4 mr-2" /> Export CSV</a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Posture</p><p className={`font-bold capitalize ${summary.posture === 'critical' ? 'text-red-700' : summary.posture === 'review' ? 'text-amber-700' : 'text-emerald-700'}`}>{summary.posture || 'unknown'}</p></div>
          <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Checks</p><p className="font-bold">{summary.totalChecks ?? 0}</p></div>
          <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Failing</p><p className="font-bold">{summary.failing ?? 0}</p></div>
          <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Critical</p><p className="font-bold text-red-700">{summary.critical ?? 0}</p></div>
          <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Affected Rows</p><p className="font-bold">{summary.affectedRows ?? 0}</p></div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50"><TableRow><TableHead>Check</TableHead><TableHead>Module</TableHead><TableHead>Severity</TableHead><TableHead className="text-right">Rows</TableHead><TableHead>Recommendation</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">Running diagnostics...</TableCell></TableRow>
              ) : failingFindings.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500"><CheckCircle2 className="w-4 h-4 inline mr-2 text-emerald-600" />No failing integrity checks detected.</TableCell></TableRow>
              ) : failingFindings.map((finding: any) => (
                <TableRow key={finding.id}>
                  <TableCell className="font-medium">{finding.title}</TableCell>
                  <TableCell>{finding.module}</TableCell>
                  <TableCell><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${finding.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{finding.severity}</span></TableCell>
                  <TableCell className="text-right font-semibold">{finding.count}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[360px]">{finding.recommendation}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-lg border bg-blue-50/60 border-blue-100 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-700 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Safe repair workflow</p>
              <p className="text-sm text-slate-600">Repair buttons below run dry-run mode only from the UI. Apply mode is intentionally kept in CLI/backend API for controlled maintenance windows.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {(overview?.repairs || []).map((repair: any) => (
                  <Button key={repair.id} size="sm" variant="outline" disabled={repairing === repair.id} onClick={() => runRepairDryRun(repair.id)}>
                    <Play className="w-3.5 h-3.5 mr-2" /> {repairing === repair.id ? 'Checking...' : repair.title}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


type ManagedUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  passwordChangedAt?: string | null;
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  employeeEmail?: string;
};

type LinkableEmployee = {
  id: string;
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
  jobTitle?: string;
  employmentStatus?: string;
  linkedUserId?: string | number | null;
  linkedUserEmail?: string | null;
  linkedUsername?: string | null;
};

type RolePermissionRow = {
  permission: string;
  defaultRoles: string[];
  allowedRoles: string[];
};

const USER_ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  warehouse_manager: 'Warehouse Manager',
  accounting: 'Accounting',
  cashier: 'Cashier',
  reception: 'Reception',
  trainer: 'Trainer',
  hr: 'HR',
  support: 'Support',
  staff: 'Staff',
  client: 'Client',
};

const emptyUserForm = {
  name: '',
  email: '',
  username: '',
  password: '',
  role: 'reception',
  status: 'active',
  employeeId: '',
};

function formatUserDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'dd/MM/yyyy HH:mm');
}

function labelRole(role: string) {
  return USER_ROLE_LABELS[role] || role.replace(/_/g, ' ');
}

function UserMaintenancePanel({ activeTab }: { activeTab: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<string[]>(['admin', 'manager', 'warehouse_manager', 'accounting', 'cashier', 'reception', 'trainer']);
  const [statuses, setStatuses] = useState<string[]>(['active', 'suspended', 'inactive']);
  const [linkableEmployees, setLinkableEmployees] = useState<LinkableEmployee[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyUserForm);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [permissionRows, setPermissionRows] = useState<RolePermissionRow[]>([]);
  const [permissionRoles, setPermissionRoles] = useState<string[]>([]);
  const [selectedPermissionRole, setSelectedPermissionRole] = useState('admin');
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const loadRoles = async () => {
    const res = await fetch('/api/settings/roles');
    if (!res.ok) return;
    const data = await res.json();
    setRoles(data.roles || roles);
    setStatuses(data.statuses || statuses);
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/settings/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (error: any) {
      toast.error(error.message || 'Network error loading users.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadEmployeeLinks = async () => {
    try {
      const res = await fetch('/api/settings/user-link-employees');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load employees for linking');
      setLinkableEmployees(data.employees || []);
    } catch (error: any) {
      toast.error(error.message || 'Network error loading employees for user links.');
    }
  };

  const loadRolePermissions = async () => {
    setLoadingPermissions(true);
    try {
      const res = await fetch('/api/settings/role-permissions');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load role permissions');
      setPermissionRows(data.permissions || []);
      const relevantRoles = (data.roles || []).filter((role: string) => !['client', 'staff'].includes(role));
      setPermissionRoles(relevantRoles);
      if (!relevantRoles.includes(selectedPermissionRole)) setSelectedPermissionRole(relevantRoles[0] || 'admin');
    } catch (error: any) {
      toast.error(error.message || 'Network error loading role permissions.');
    } finally {
      setLoadingPermissions(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'users') return;
    loadRoles();
    loadUsers();
    loadEmployeeLinks();
    loadRolePermissions();
  }, [activeTab, statusFilter]);

  const resetForm = () => {
    setEditingUserId(null);
    setForm(emptyUserForm);
  };

  const editUser = (user: ManagedUser) => {
    setEditingUserId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      username: user.username,
      password: '',
      role: user.role === 'super_admin' ? 'admin' : user.role,
      status: user.status,
      employeeId: user.employeeId || '',
    });
  };

  const submitUser = async () => {
    setSavingUser(true);
    try {
      const body: any = { ...form };
      if (editingUserId && !body.password) delete body.password;
      const res = await fetch(editingUserId ? `/api/settings/users/${editingUserId}` : '/api/settings/users', {
        method: editingUserId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save user');
      toast.success(editingUserId ? 'User updated successfully.' : 'User created successfully.');
      resetForm();
      loadUsers();
      loadEmployeeLinks();
    } catch (error: any) {
      toast.error(error.message || 'Network error saving user.');
    } finally {
      setSavingUser(false);
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    if (user.status === 'active') {
      toast.error('Suspend or deactivate this user before deleting the account.');
      return;
    }
    if (!window.confirm(`Delete user ${user.email}? This action is audited and cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/settings/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      toast.success('User deleted successfully.');
      loadUsers();
      loadEmployeeLinks();
    } catch (error: any) {
      toast.error(error.message || 'Network error deleting user.');
    }
  };

  const updateRolePermission = async (permission: string, role: string, allowed: boolean | null) => {
    try {
      const res = await fetch(`/api/settings/role-permissions/${encodeURIComponent(role)}/${encodeURIComponent(permission)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update permission');
      setPermissionRows(rows => rows.map(row => row.permission === permission ? { ...row, allowedRoles: data.allowedRoles || row.allowedRoles, defaultRoles: data.defaultRoles || row.defaultRoles } : row));
      toast.success('Role permission updated.');
    } catch (error: any) {
      toast.error(error.message || 'Network error updating role permission.');
    }
  };

  const selectedRoleLabel = labelRole(selectedPermissionRole);
  const availableEmployees = linkableEmployees.filter((employee) => !employee.linkedUserId || String(employee.linkedUserId) === String(editingUserId));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCog className="w-5 h-5" /> {editingUserId ? 'Edit User' : 'Add User'}</CardTitle>
            <CardDescription>Create staff credentials, assign a predefined profile and control account status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@powergym.com" />
            </div>
            <div>
              <Label>Username</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jane.doe" />
            </div>
            <div>
              <Label>Linked Employee</Label>
              <select className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">No employee link</option>
                {availableEmployees.map(employee => {
                  const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email || employee.id;
                  const code = employee.employeeCode ? ` - ${employee.employeeCode}` : '';
                  return <option key={employee.id} value={employee.id}>{fullName}{code}</option>;
                })}
              </select>
              <p className="text-xs text-slate-500 mt-1">Optional 1:1 link for accountability. Already-linked employees are hidden.</p>
            </div>
            <div>
              <Label>{editingUserId ? 'Reset Password (optional)' : 'Password'}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars, upper/lower/number/symbol" />
              <p className="text-xs text-slate-500 mt-1">Stored only as a salted scrypt hash; plaintext passwords are never saved.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Assigned Role</Label>
                <select className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {roles.map(role => <option key={role} value={role}>{labelRole(role)}</option>)}
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {statuses.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={submitUser} disabled={savingUser} className="bg-indigo-600 hover:bg-indigo-700">
                <PlusCircle className="w-4 h-4 mr-2" /> {savingUser ? 'Saving...' : editingUserId ? 'Save User' : 'Add User'}
              </Button>
              {editingUserId && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle>User Accounts</CardTitle>
              <CardDescription>Manage active, suspended and inactive staff accounts.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input placeholder="Search name, email, username" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadUsers(); }} />
              <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {statuses.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <Button variant="outline" onClick={loadUsers} disabled={loadingUsers}><RefreshCcw className="w-4 h-4 mr-2" />Refresh</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50"><TableRow><TableHead>Name</TableHead><TableHead>Email / Username</TableHead><TableHead>Linked Employee</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last Login</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {loadingUsers ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-slate-500">Loading users...</TableCell></TableRow>
                  ) : users.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-slate-500">No users found.</TableCell></TableRow>
                  ) : users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name || '-'}</TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{user.email}</div>
                        <div className="text-xs text-slate-500">@{user.username || '-'}</div>
                      </TableCell>
                      <TableCell>
                        {user.employeeId ? (
                          <div>
                            <div className="text-sm font-medium">{user.employeeName || user.employeeEmail || user.employeeId}</div>
                            <div className="text-xs text-slate-500">{user.employeeCode || user.employeeEmail || 'Employee linked'}</div>
                          </div>
                        ) : <span className="text-xs text-slate-400">Not linked</span>}
                      </TableCell>
                      <TableCell>{labelRole(user.role)}</TableCell>
                      <TableCell><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : user.status === 'suspended' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{user.status}</span></TableCell>
                      <TableCell className="text-xs text-slate-500">{formatUserDate(user.lastLoginAt)}</TableCell>
                      <TableCell className="text-right space-x-2 rtl:space-x-reverse">
                        <Button size="sm" variant="outline" onClick={() => editUser(user)} disabled={user.role === 'super_admin'}>Edit</Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteUser(user)} disabled={user.role === 'super_admin' || user.status === 'active'}>Delete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <CardTitle>Configurable Role Permissions</CardTitle>
            <CardDescription>Adjust access rights per role for future expansion. Defaults remain defined in the central RBAC matrix.</CardDescription>
          </div>
          <div className="flex gap-2">
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={selectedPermissionRole} onChange={(e) => setSelectedPermissionRole(e.target.value)}>
              {permissionRoles.map(role => <option key={role} value={role}>{labelRole(role)}</option>)}
            </select>
            <Button variant="outline" onClick={loadRolePermissions} disabled={loadingPermissions}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 mb-4">
            Editing this matrix changes backend authorization immediately for the current server process and persists overrides in the database. Reset returns a permission to its default RBAC rule.
          </div>
          <div className="border rounded-md overflow-x-auto max-h-[520px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0"><TableRow><TableHead>Permission</TableHead><TableHead>Default</TableHead><TableHead>{selectedRoleLabel} Access</TableHead><TableHead className="text-right">Override</TableHead></TableRow></TableHeader>
              <TableBody>
                {loadingPermissions ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-500">Loading role permissions...</TableCell></TableRow>
                ) : permissionRows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-500">No permissions available.</TableCell></TableRow>
                ) : permissionRows.map(row => {
                  const defaultAllowed = row.defaultRoles.includes(selectedPermissionRole);
                  const allowed = row.allowedRoles.includes(selectedPermissionRole);
                  const overridden = defaultAllowed !== allowed;
                  return (
                    <TableRow key={row.permission}>
                      <TableCell className="font-mono text-xs">{row.permission}</TableCell>
                      <TableCell>{defaultAllowed ? 'Allowed' : 'Denied'}</TableCell>
                      <TableCell>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={allowed} onChange={(e) => updateRolePermission(row.permission, selectedPermissionRole, e.target.checked)} />
                          {allowed ? 'Allowed' : 'Denied'}
                        </label>
                      </TableCell>
                      <TableCell className="text-right">
                        {overridden ? <Button size="sm" variant="outline" onClick={() => updateRolePermission(row.permission, selectedPermissionRole, null)}>Reset</Button> : <span className="text-xs text-slate-400">Default</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  const [gymName, setGymName] = useState('Gym Admin');
  const [staffRoles, setStaffRoles] = useState('admin, manager, reception, cashier, trainer, accounting, warehouse_manager, hr, support');
  const [departments, setDepartments] = useState('Sales, Management, Training, Operations, Finance');
  const [rooms, setRooms] = useState('Personal Training Area, Sala A, Sala B, Box Exterior');
  const [ecardTitle, setEcardTitle] = useState('PowerGym QR e-Card');
  const [ecardNote, setEcardNote] = useState('Present this QR e-card at reception for access validation.');
  const [ecardBackgroundImage, setEcardBackgroundImage] = useState('');
  const [loading, setLoading] = useState(true);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Search and Filter for Audit Logs
  const [auditSearch, setAuditSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [logsFilter, setLogsFilter] = useState<'all' | 'error'>('all');

  // DB Monitoring & Backups
  const [dbStatus, setDbStatus] = useState<any>(null);

  // Delivery 7: security, performance, audit, and operational reporting
  const [platformHealth, setPlatformHealth] = useState<any>(null);
  const [operationsSummary, setOperationsSummary] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityOverview, setSecurityOverview] = useState<any>(null);
  const [resetDeliveries, setResetDeliveries] = useState<any[]>([]);
  const [securityFrom, setSecurityFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [securityTo, setSecurityTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('all');

  useEffect(() => {
    async function checkDbHealth() {
      try {
        const res = await fetch('/api/db-health');
        if (res.ok) {
          const data = await res.json();
          setDbStatus(data);
          
          if (data.isCritical) {
            toast.error(`Database is critical! Offline for ${data.downtimeSecs}s`, {
              icon: <AlertTriangle className="text-red-500 w-5 h-5"/>,
              duration: 10000
            });
          }
        } else if (res.status === 503) {
          const data = await res.json();
          setDbStatus(data);
          if (data.isCritical) {
            toast.error(`Database is critical! Offline for ${data.downtimeSecs}s`, {
              icon: <AlertTriangle className="text-red-500 w-5 h-5"/>,
              duration: 10000
            });
          }
        } else {
          setDbStatus({ status: 'error', message: 'Connection issue' });
        }
      } catch (err) {
        setDbStatus({ status: 'error', message: 'Offline' });
      }
    }
    checkDbHealth();
    const interval = setInterval(checkDbHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadSettings() {
      try {
        const docRef = doc(db, 'settings', 'general');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.gymName) setGymName(data.gymName);
          if (data.staffRoles && Array.isArray(data.staffRoles)) setStaffRoles(data.staffRoles.join(', '));
          if (data.departments && Array.isArray(data.departments)) setDepartments(data.departments.join(', '));
          if (data.rooms && Array.isArray(data.rooms)) setRooms(data.rooms.join(', '));
          if (data.ecardTitle) setEcardTitle(data.ecardTitle);
          if (data.ecardNote) setEcardNote(data.ecardNote);
          if (data.ecardBackgroundImage) setEcardBackgroundImage(data.ecardBackgroundImage);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
        toast.error("Failed to load settings.");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const loadAuditLogs = async () => {
    setLogsLoading(true);
    try {
      let res = await fetch('/api/platform/audit-logs?limit=200');
      let data = res.ok ? await res.json() : null;

      if (!res.ok) {
        // Backward-compatible fallback for older deployments.
        res = await fetch('/api/audit-logs');
        data = res.ok ? await res.json() : null;
      }

      if (res.ok && data) {
        setAuditLogs((data.logs || []).map((log: any) => ({
          id: log.id,
          action: log.method ? `${log.method}_${log.action || 'request'}` : log.action,
          details: log.path ? `${log.path} | ${log.status_code} | ${log.duration_ms}ms` : log.details,
          performedBy: log.actor_email || log.actor_role || log.performed_by || 'system',
          createdAt: log.created_at,
          severity: log.severity || 'info',
          statusCode: log.status_code,
          module: log.module,
        })));
      } else {
        toast.error("Failed to load audit logs from server.");
      }
    } catch (error) {
      console.error("Error loading audit logs:", error);
      toast.error("Network error loading audit logs.");
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab]);

  const loadSecurityOverview = async () => {
    setSecurityLoading(true);
    try {
      const securityParams = new URLSearchParams({ from: securityFrom, to: securityTo });
      const deliveryParams = new URLSearchParams({ from: securityFrom, to: securityTo, limit: '50' });
      if (deliveryStatusFilter !== 'all') deliveryParams.set('status', deliveryStatusFilter);

      const [healthRes, summaryRes, cacheRes, overviewRes, deliveriesRes] = await Promise.all([
        fetch('/api/platform/system/health'),
        fetch(`/api/platform/reports/operations-summary?${securityParams.toString()}`),
        fetch('/api/platform/performance/cache'),
        fetch(`/api/platform/security/overview?${securityParams.toString()}`),
        fetch(`/api/platform/security/password-reset-deliveries?${deliveryParams.toString()}`),
      ]);

      if (healthRes.ok) setPlatformHealth(await healthRes.json());
      if (summaryRes.ok) setOperationsSummary(await summaryRes.json());
      if (overviewRes.ok) setSecurityOverview(await overviewRes.json());
      if (deliveriesRes.ok) {
        const deliveryData = await deliveriesRes.json();
        setResetDeliveries(deliveryData.deliveries || []);
      }
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        setCacheStats(cacheData.cache);
      }

      if (!healthRes.ok || !summaryRes.ok || !cacheRes.ok || !overviewRes.ok || !deliveriesRes.ok) {
        toast.error('Some security/reporting endpoints could not be loaded.');
      }
    } catch (error) {
      console.error('Error loading security overview:', error);
      toast.error('Network error loading security overview.');
    } finally {
      setSecurityLoading(false);
    }
  };

  const clearApiCache = async () => {
    try {
      const res = await fetch('/api/platform/performance/cache', { method: 'DELETE' });
      if (!res.ok) throw new Error('Cache clear failed');
      toast.success('API cache cleared.');
      loadSecurityOverview();
    } catch (error) {
      toast.error('Failed to clear API cache.');
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      loadSecurityOverview();
    }
  }, [activeTab, securityFrom, securityTo, deliveryStatusFilter]);


  const handleEcardBackgroundUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file for the e-card background.');
      return;
    }
    if (file.size > 750 * 1024) {
      toast.error('Please use an image smaller than 750 KB for reliable database storage.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setEcardBackgroundImage(String(reader.result || ''));
    reader.onerror = () => toast.error('Failed to read background image.');
    reader.readAsDataURL(file);
  };


  const handleSave = async () => {
    try {
      const docRef = doc(db, 'settings', 'general');
      await setDoc(docRef, {
        gymName,
        staffRoles: staffRoles.split(',').map(s => s.trim()).filter(Boolean),
        departments: departments.split(',').map(s => s.trim()).filter(Boolean),
        rooms: rooms.split(',').map(s => s.trim()).filter(Boolean),
        ecardTitle,
        ecardNote,
        ecardBackgroundImage
      }, { merge: true });
      toast.success('Settings saved successfully.');
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings.");
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading settings...</div>;

  const isErrorLog = (log: any) => {
    const text = `${log.action} ${log.details}`.toLowerCase();
    return text.includes('error') || text.includes('critical') || text.includes('fail');
  };

  const filteredAuditLogs = auditLogs.filter(log => {
    if (logsFilter === 'error' && !isErrorLog(log)) return false;

    // Action / Details search
    const searchString = `${log.action} ${log.details} ${log.performedBy}`.toLowerCase();
    if (auditSearch && !searchString.includes(auditSearch.toLowerCase())) return false;
    
    // Date Range
    if (startDate || endDate) {
      const logDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
      if (startDate && new Date(startDate) > logDate) return false;
      if (endDate) {
        // include full day of end date
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (end < logDate) return false;
      }
    }
    
    return true;
  });

  // Prepare chart data for last 7 days from filtered logs
  const last7Days = Array.from({ length: 7 }).map((_, i) => format(subDays(new Date(), i), 'dd/MM')).reverse();
  const chartData = last7Days.map(date => ({
    name: date,
    API_GET: 0,
    API_POST: 0,
    API_PUT: 0,
    API_DELETE: 0,
    OTHER: 0
  }));

  filteredAuditLogs.forEach(log => {
    const logDate = new Date(log.createdAt?.toDate ? log.createdAt.toDate() : log.createdAt);
    const dateStr = format(logDate, 'dd/MM');
    const dayData = chartData.find(d => d.name === dateStr);
    if (dayData) {
       const action = typeof log.action === 'string' ? log.action.toUpperCase() : '';
       if (action.includes('GET')) dayData.API_GET++;
       else if (action.includes('POST')) dayData.API_POST++;
       else if (action.includes('PUT')) dayData.API_PUT++;
       else if (action.includes('DELETE')) dayData.API_DELETE++;
       else dayData.OTHER++;
    }
  });

  const securityExportParams = new URLSearchParams({ from: securityFrom, to: securityTo }).toString();
  const securityKpis = securityOverview?.kpis || {};
  const resetSummary = securityOverview?.resetSummary || {};
  const securityAlerts = securityOverview?.alerts || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">System Settings</h1>
          <p className="text-slate-500 mt-1">Configure global application parameters and view system logs.</p>
        </div>
        
        {/* DB Status Widget */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2.5 rounded-lg shadow-sm">
          <Database className="w-5 h-5 text-slate-400" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Database Status</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {dbStatus?.status === 'healthy' ? (
                <>
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                   <span className="text-sm font-medium text-emerald-700">Healthy</span>
                </>
              ) : dbStatus?.status === 'error' ? (
                <>
                   <div className="w-2 h-2 rounded-full bg-red-500"></div>
                   <span className="text-sm font-medium text-red-600">Error: {dbStatus.message}</span>
                </>
              ) : (
                <>
                   <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                   <span className="text-sm font-medium text-slate-500">Checking...</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ScreenReportActions
        reportIds={['security-audit']}
        params={{ q: auditSearch }}
        title="Security and audit PDFs"
        description="Export security audit events with the current audit search context."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General Configuration</TabsTrigger>
          <TabsTrigger value="users">User Maintenance</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="security">Security & Reports</TabsTrigger>
          <TabsTrigger value="maintenance">Database Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic information for your gym software.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Gym Name</Label>
                <Input 
                  value={gymName} 
                  onChange={(e) => setGymName(e.target.value)} 
                  placeholder="e.g. Iron Forge Gym"
                />
              </div>
              <div className="space-y-2">
                <Label>Staff Roles (comma separated)</Label>
                <Input 
                  value={staffRoles} 
                  onChange={(e) => setStaffRoles(e.target.value)} 
                  placeholder="admin, manager, reception, cashier..."
                />
                <p className="text-xs text-slate-500">Used to categorize types of employees.</p>
              </div>
              <div className="space-y-2">
                <Label>Staff Departments (comma separated)</Label>
                <Input 
                  value={departments} 
                  onChange={(e) => setDepartments(e.target.value)} 
                  placeholder="Sales, Management, Training..."
                />
                <p className="text-xs text-slate-500">Divisions within your gym.</p>
              </div>
              <div className="space-y-2">
                <Label>Rooms / Locations (comma separated)</Label>
                <Input 
                  value={rooms} 
                  onChange={(e) => setRooms(e.target.value)} 
                  placeholder="Personal Training Area, Sala A, Sala B..."
                />
                <p className="text-xs text-slate-500">Locations available for classes and PT.</p>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-indigo-600" />
                  <div>
                    <p className="font-semibold text-slate-900">QR e-Card Template</p>
                    <p className="text-xs text-slate-500">Customize the PDF e-card generated from the Members section.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>e-Card Title</Label>
                    <Input value={ecardTitle} onChange={(e) => setEcardTitle(e.target.value)} placeholder="PowerGym QR e-Card" />
                  </div>
                  <div className="space-y-2">
                    <Label>Background Image</Label>
                    <Input type="file" accept="image/*" onChange={(e) => handleEcardBackgroundUpload(e.target.files?.[0])} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>e-Card Note</Label>
                  <Input value={ecardNote} onChange={(e) => setEcardNote(e.target.value)} placeholder="Present this QR e-card at reception..." />
                </div>
                {ecardBackgroundImage && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600">Current background preview</p>
                    <div className="flex items-center gap-3">
                      <img src={ecardBackgroundImage} alt="QR e-card background preview" className="h-24 w-40 rounded-lg border object-cover" />
                      <Button type="button" variant="outline" onClick={() => setEcardBackgroundImage('')}>Remove Background</Button>
                    </div>
                  </div>
                )}
              </div>

              <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">Save General Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <UserMaintenancePanel activeTab={activeTab} />
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex flex-col space-y-4">
              <div className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Audit Logs</CardTitle>
                  <CardDescription>Recent system actions and changes. Showing up to last 100 events.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadAuditLogs} disabled={logsLoading}>
                  {logsLoading ? 'Loading...' : 'Refresh Logs'}
                </Button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                 <div className="flex-1 space-y-1.5">
                    <Label className="text-xs text-slate-500 uppercase font-semibold">Search Actions</Label>
                    <Input 
                      placeholder="Filter by action type, details, or user..." 
                      value={auditSearch} 
                      onChange={(e) => setAuditSearch(e.target.value)} 
                      className="bg-white"
                    />
                 </div>
                 <div className="w-full sm:w-40 space-y-1.5">
                    <Label className="text-xs text-slate-500 uppercase font-semibold">Severity</Label>
                    <select 
                      value={logsFilter}
                      onChange={(e) => setLogsFilter(e.target.value as any)}
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="all">All Logs</option>
                      <option value="error">Error Logs</option>
                    </select>
                 </div>
                 <div className="w-full sm:w-40 space-y-1.5">
                    <Label className="text-xs text-slate-500 uppercase font-semibold">From Date</Label>
                    <DateInput 
                      value={startDate} 
                      onChange={(v) => setStartDate(v)} 
                      className="bg-white"
                    />
                 </div>
                 <div className="w-full sm:w-40 space-y-1.5">
                    <Label className="text-xs text-slate-500 uppercase font-semibold">To Date</Label>
                    <DateInput 
                      value={endDate} 
                      onChange={(v) => setEndDate(v)} 
                      className="bg-white"
                    />
                 </div>
                 <div className="flex items-end pb-0.5">
                    <Button variant="ghost" className="text-slate-500 h-9" onClick={() => { setAuditSearch(''); setStartDate(''); setEndDate(''); setLogsFilter('all'); }}>Clear</Button>
                 </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAuditLogs.length > 0 && (
                <div className="h-[250px] w-full mb-8 pt-4 pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">Action Frequency (Last 7 Days)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                      <Bar dataKey="API_GET" name="Read (GET)" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="API_POST" name="Create (POST)" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="API_PUT" name="Update (PUT)" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="API_DELETE" name="Delete (DEL)" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="OTHER" name="Other" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              
              {logsLoading ? (
                <div className="text-center p-8 text-slate-500">Loading audit logs...</div>
              ) : filteredAuditLogs.length === 0 ? (
                <div className="text-center p-8 text-slate-500 border rounded-md">No action logs found matching your filters.</div>
              ) : (
                <div className="border rounded-md max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0">
                      <TableRow>
                        <TableHead>Date / Time</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>User ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAuditLogs.map((log) => (
                        <TableRow key={log.id} className={isErrorLog(log) ? 'bg-red-50/30' : ''}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            {isErrorLog(log) ? (
                               <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                                 <AlertTriangle className="w-3.5 h-3.5" /> Error
                               </span>
                            ) : (
                               <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                 <CheckCircle2 className="w-3.5 h-3.5" /> Info
                               </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 uppercase tracking-wider">
                              {log.action}
                            </span>
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {log.details || `Target ID: ${log.targetId}`}
                          </TableCell>
                          <TableCell className="text-slate-500 text-xs font-mono truncate max-w-[120px]">
                            {log.performedBy}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="mb-6">
            <CardHeader className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div>
                <CardTitle>Security Center</CardTitle>
                <CardDescription>Operational security posture, reset delivery status, access denials, slow requests, and exportable evidence.</CardDescription>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 w-full lg:w-auto">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 uppercase font-semibold">From</Label>
                  <DateInput value={securityFrom} onChange={(v) => setSecurityFrom(v)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 uppercase font-semibold">To</Label>
                  <DateInput value={securityTo} onChange={(v) => setSecurityTo(v)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 uppercase font-semibold">Reset Status</Label>
                  <select
                    value={deliveryStatusFilter}
                    onChange={(e) => setDeliveryStatusFilter(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="skipped">Skipped</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline" onClick={loadSecurityOverview} disabled={securityLoading}>{securityLoading ? 'Loading...' : 'Refresh'}</Button>
                  <Button variant="outline" asChild>
                    <a href={`/api/platform/security/overview.csv?${securityExportParams}`} download>CSV</a>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {securityOverview?.range?.truncated && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Selected range was limited to {securityOverview.range.maxDays} days to keep observability queries bounded.
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Requests</p><p className="font-bold text-lg">{securityKpis.totalRequests ?? 0}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Warnings</p><p className="font-bold text-lg">{securityKpis.warnings ?? 0}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">5xx Errors</p><p className="font-bold text-lg">{securityKpis.serverErrors ?? 0}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Denied</p><p className="font-bold text-lg">{securityKpis.accessDenials ?? 0}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Avg API</p><p className="font-bold text-lg">{securityKpis.avgDurationMs ?? 0}ms</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Reset Sent</p><p className="font-bold text-lg">{resetSummary.sent ?? 0}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Reset Failed</p><p className="font-bold text-lg">{resetSummary.failed ?? 0}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Reset Used</p><p className="font-bold text-lg">{resetSummary.completed ?? 0}</p></div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Server className="w-4 h-4" /> System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{platformHealth?.status || (securityLoading ? 'Loading' : 'Unknown')}</div>
                <p className="text-xs text-slate-500 mt-1">DB latency: {platformHealth?.dbLatencyMs ?? '-'}ms</p>
                <p className="text-xs text-slate-500">Uptime: {platformHealth?.uptimeSeconds ?? '-'}s</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4" /> API Cache</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{cacheStats?.entries ?? 0}</div>
                <p className="text-xs text-slate-500 mt-1">Cached responses, TTL {cacheStats?.ttlMs ? `${cacheStats.ttlMs / 1000}s` : '-'}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={clearApiCache}>Clear Cache</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Access Denials</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{securityKpis.accessDenials ?? operationsSummary?.topDenied?.reduce((sum: number, row: any) => sum + Number(row.denied_count || 0), 0) ?? 0}</div>
                <p className="text-xs text-slate-500 mt-1">Unauthorized/forbidden requests in selected range.</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Security Alerts</CardTitle>
              <CardDescription>Calculated signals based on server errors, denied access, slow endpoints, and password reset delivery failures.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {securityAlerts.map((alert: any) => (
                  <div key={alert.id} className={`rounded-lg border p-4 ${alert.severity === 'critical' ? 'bg-red-50 border-red-200' : alert.severity === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex items-start gap-3">
                      {alert.severity === 'info' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" /> : <AlertTriangle className={`w-5 h-5 mt-0.5 ${alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />}
                      <div>
                        <p className="font-semibold text-slate-900">{alert.title}</p>
                        <p className="text-sm text-slate-600">{alert.message}</p>
                        <p className="text-xs text-slate-500 mt-1">Recommended action: {alert.recommendation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Denied Access</CardTitle>
                <CardDescription>Most frequent 401/403 paths and actors in the selected range.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50"><TableRow><TableHead>Path</TableHead><TableHead>Actor</TableHead><TableHead className="text-right">Denied</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(securityOverview?.topDenied || []).length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-6 text-slate-500">No denied access events.</TableCell></TableRow>
                      ) : securityOverview.topDenied.map((row: any, index: number) => (
                        <TableRow key={`${row.path}-${row.actor}-${index}`}>
                          <TableCell className="font-mono text-xs max-w-[260px] truncate">{row.path}</TableCell>
                          <TableCell className="text-xs text-slate-500">{row.actor}</TableCell>
                          <TableCell className="text-right font-semibold">{row.deniedCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Slowest API Requests</CardTitle>
                <CardDescription>Useful for finding routes that can affect operations or PDF generation.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50"><TableRow><TableHead>Route</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Duration</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(securityOverview?.topSlow || []).length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-6 text-slate-500">No API timing data.</TableCell></TableRow>
                      ) : securityOverview.topSlow.map((row: any, index: number) => (
                        <TableRow key={`${row.path}-${index}`}>
                          <TableCell className="font-mono text-xs max-w-[300px] truncate">{row.method} {row.path}</TableCell>
                          <TableCell>{row.statusCode}</TableCell>
                          <TableCell className="text-right font-semibold">{row.durationMs}ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Password Reset Delivery History</CardTitle>
              <CardDescription>Auditable delivery status without exposing reset token hashes or raw tokens.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0"><TableRow><TableHead>Created</TableHead><TableHead>Email</TableHead><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead>Provider</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {resetDeliveries.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">No password reset delivery records in range.</TableCell></TableRow>
                    ) : resetDeliveries.map((delivery: any) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(delivery.createdAt)}</TableCell>
                        <TableCell className="font-mono text-xs">{delivery.email}</TableCell>
                        <TableCell>{delivery.deliveryChannel || '-'}</TableCell>
                        <TableCell>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${delivery.deliveryStatus === 'failed' ? 'bg-red-100 text-red-700' : delivery.deliveryStatus === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                            {delivery.deliveryStatus || 'unknown'}
                          </span>
                        </TableCell>
                        <TableCell>{delivery.deliveryProvider || '-'}</TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-[260px] truncate">{delivery.deliveryLastError || (delivery.usedAt ? 'Token used' : delivery.deliveredAt ? 'Delivered' : 'Pending')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Operations Summary</CardTitle>
                <CardDescription>Combined security, performance, membership, and finance KPIs for the selected range.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadSecurityOverview} disabled={securityLoading}>{securityLoading ? 'Loading...' : 'Refresh'}</Button>
                <Button variant="outline" asChild>
                  <a href={`/api/platform/reports/operations-summary.csv?${securityExportParams}`} download>Export CSV</a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Income</p><p className="font-bold">${Number(operationsSummary?.kpis?.income || 0).toFixed(2)}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Expenses</p><p className="font-bold">${Number(operationsSummary?.kpis?.expenses || 0).toFixed(2)}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Net</p><p className="font-bold">${Number(operationsSummary?.kpis?.net || 0).toFixed(2)}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Members</p><p className="font-bold">{operationsSummary?.kpis?.activeMembers ?? 0}</p></div>
                <div className="rounded-lg border p-3 bg-slate-50"><p className="text-xs text-slate-500">Subscriptions</p><p className="font-bold">{operationsSummary?.kpis?.activeSubscriptions ?? 0}</p></div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Warnings/Errors</TableHead>
                      <TableHead className="text-right">Avg Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(operationsSummary?.auditByModule || []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-500">No platform audit data yet.</TableCell></TableRow>
                    ) : operationsSummary.auditByModule.map((row: any) => (
                      <TableRow key={row.module}>
                        <TableCell className="font-medium">{row.module}</TableCell>
                        <TableCell className="text-right">{row.total}</TableCell>
                        <TableCell className="text-right">{row.issues}</TableCell>
                        <TableCell className="text-right">{row.avg_duration_ms || row.avgDurationMs || 0}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="space-y-6">
            <DataIntegrityPanel activeTab={activeTab} />
            <DatabaseBackup activeTab={activeTab} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
