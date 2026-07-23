import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, History, Plus, RefreshCw, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import DateInput from '../components/DateInput';
import { useLocalization } from '../contexts/LocalizationContext';
import { planManagementApi } from '../lib/planManagementApi';
import { subscriptionsV2Api, type SubscriptionV2 } from '../lib/subscriptionsV2Api';

const copy = {
  en: {
    title: 'Multi-user memberships', subtitle: 'Manage holders, beneficiaries, capacity, member exceptions and history.',
    back: 'Membership plans', refresh: 'Refresh', subscription: 'Subscription', select: 'Select a subscription',
    capacity: 'Capacity', occupied: 'occupied', available: 'available', add: 'Add member',
    member: 'Member', role: 'Role', joined: 'Joined', status: 'Status', restrictions: 'Restrictions',
    actions: 'Actions', existing: 'Existing member', createNew: 'Create new member',
    memberId: 'Member ID', firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone',
    joinedAt: 'Join date', save: 'Add to subscription', cancel: 'Cancel', suspend: 'Suspend',
    activate: 'Activate', remove: 'Remove', futureBookings: 'Future bookings', history: 'History',
    cancelBookings: 'Cancel future bookings', keepBookings: 'Keep future bookings', reviewBookings: 'Manual review',
    noMembers: 'No members found for this subscription.', holder: 'Holder', beneficiary: 'Beneficiary',
    editDates: 'Modify dates', startDate: 'Start date', endDate: 'End date', saveDates: 'Save dates',
    invalidDates: 'Enter a valid date range.', datesUpdated: 'Subscription dates updated.',
  },
  ar: {
    title: 'العضويات متعددة المستخدمين', subtitle: 'إدارة المسؤول والمستفيدين والسعة والاستثناءات وسجل التعديلات.',
    back: 'خطط العضوية', refresh: 'تحديث', subscription: 'الاشتراك', select: 'اختر اشتراكاً',
    capacity: 'السعة', occupied: 'مشغولة', available: 'متاحة', add: 'إضافة عضو',
    member: 'العضو', role: 'الدور', joined: 'تاريخ الانضمام', status: 'الحالة', restrictions: 'القيود',
    actions: 'الإجراءات', existing: 'عضو موجود', createNew: 'إنشاء عضو جديد',
    memberId: 'معرف العضو', firstName: 'الاسم', lastName: 'اسم العائلة', email: 'البريد الإلكتروني', phone: 'الهاتف',
    joinedAt: 'تاريخ الانضمام', save: 'إضافة إلى الاشتراك', cancel: 'إلغاء', suspend: 'تعليق',
    activate: 'تفعيل', remove: 'إزالة', futureBookings: 'الحجوزات المستقبلية', history: 'السجل',
    cancelBookings: 'إلغاء الحجوزات المستقبلية', keepBookings: 'الإبقاء على الحجوزات', reviewBookings: 'مراجعة يدوية',
    noMembers: 'لا يوجد أعضاء في هذا الاشتراك.', holder: 'المسؤول', beneficiary: 'مستفيد',
    editDates: 'تعديل التواريخ', startDate: 'تاريخ البداية', endDate: 'تاريخ النهاية', saveDates: 'حفظ التواريخ',
    invalidDates: 'أدخل نطاق تواريخ صالحاً.', datesUpdated: 'تم تحديث تواريخ الاشتراك.',
  },
} as const;

type AddForm = {
  mode: 'existing' | 'new';
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  joinedAt: string;
  restrictions: string;
};

const emptyForm: AddForm = { mode: 'existing', memberId: '', firstName: '', lastName: '', email: '', phone: '', joinedAt: '', restrictions: '' };

export default function MultiUserMemberships() {
  const { locale } = useLocalization();
  const [searchParams] = useSearchParams();
  const c = locale === 'ar' ? copy.ar : copy.en;
  const requestedId = searchParams.get('subscriptionId') || '';
  const [subscriptions, setSubscriptions] = useState<SubscriptionV2[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [capacity, setCapacity] = useState({ maximum: 0, occupied: 0, available: 0 });
  const [history, setHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [dateForm, setDateForm] = useState({ startDate: '', endDate: '' });
  const [form, setForm] = useState<AddForm>(emptyForm);
  const [bookingPolicy, setBookingPolicy] = useState<'cancel' | 'keep' | 'manual_review'>('cancel');

  const loadSubscriptions = async () => {
    try {
      const response = await subscriptionsV2Api.listSubscriptions({ status: 'all' });
      const multi = response.subscriptions.filter((item) => item.planType !== 'individual');
      setSubscriptions(multi);
      setSelectedId((current) => {
        if (requestedId && multi.some((item) => item.id === requestedId)) return requestedId;
        return current || multi[0]?.id || '';
      });
    } catch (error: any) { toast.error(error?.message || 'Unable to load subscriptions'); }
  };

  const loadMembers = async (subscriptionId = selectedId) => {
    if (!subscriptionId) { setMembers([]); return; }
    try {
      const response = await planManagementApi.listSubscriptionMembers(subscriptionId);
      setMembers(response.members as any[]);
      setCapacity(response.capacity);
    } catch (error: any) { toast.error(error?.message || 'Unable to load members'); }
  };

  useEffect(() => { loadSubscriptions(); }, []);
  useEffect(() => { loadMembers(selectedId); }, [selectedId]);

  const openDates = () => {
    const selected = subscriptions.find((item) => item.id === selectedId);
    setDateForm({
      startDate: selected?.startDate ? String(selected.startDate).slice(0, 10) : '',
      endDate: selected?.endDate ? String(selected.endDate).slice(0, 10) : '',
    });
    setDatesOpen(true);
  };

  const updateDates = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dateForm.startDate || !dateForm.endDate || dateForm.endDate < dateForm.startDate) {
      return toast.error(c.invalidDates);
    }
    try {
      await planManagementApi.updateSubscriptionDates(selectedId, dateForm.startDate, dateForm.endDate);
      setDatesOpen(false);
      await loadSubscriptions();
      await loadMembers(selectedId);
      toast.success(c.datesUpdated);
    } catch (error: any) { toast.error(error?.message || c.invalidDates); }
  };

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await planManagementApi.addSubscriptionMember(selectedId, {
        memberId: form.mode === 'existing' ? form.memberId : undefined,
        newMember: form.mode === 'new' ? { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone } : undefined,
        joinedAt: form.joinedAt || undefined,
        restrictions: { notes: form.restrictions },
      });
      setAddOpen(false);
      setForm(emptyForm);
      await loadMembers();
      toast.success(c.save);
    } catch (error: any) { toast.error(error?.message || 'Unable to add member'); }
  };

  const updateStatus = async (member: any, status: 'active' | 'suspended' | 'removed') => {
    try {
      await planManagementApi.updateSubscriptionMember(selectedId, member.memberId, {
        status, futureBookingPolicy: bookingPolicy, restrictions: member.restrictions || {},
      });
      await loadMembers();
      toast.success(c.status);
    } catch (error: any) { toast.error(error?.message || 'Unable to update member'); }
  };

  const showHistory = async () => {
    try {
      const response = await planManagementApi.getSubscriptionMemberHistory(selectedId);
      setHistory(response.history);
      setHistoryOpen(true);
    } catch (error: any) { toast.error(error?.message || 'Unable to load history'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-3xl font-bold text-slate-900">{c.title}</h1><p className="text-sm text-slate-500">{c.subtitle}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/plans"><ArrowLeft className="me-2 h-4 w-4" />{c.back}</Link></Button>
          <Button variant="outline" onClick={() => { loadSubscriptions(); loadMembers(); }}><RefreshCw className="me-2 h-4 w-4" />{c.refresh}</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{c.subscription}</CardTitle><CardDescription>{c.select}</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label>{c.subscription}</Label>
            <select className="h-10 w-full rounded-md border bg-white px-3" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">{c.select}</option>
              {subscriptions.map((item) => <option key={item.id} value={item.id}>{item.planName} — {item.id}</option>)}
            </select>
          </div>
          <div className="rounded-lg border px-4 py-2 text-sm">
            <div className="font-medium">{c.capacity}: {capacity.occupied}/{capacity.maximum}</div>
            <div className="text-slate-500">{capacity.available} {c.available}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openDates} disabled={!selectedId}><CalendarDays className="me-2 h-4 w-4" />{c.editDates}</Button>
            <Button variant="outline" onClick={showHistory} disabled={!selectedId}><History className="me-2 h-4 w-4" />{c.history}</Button>
            <Button onClick={() => setAddOpen(true)} disabled={!selectedId || capacity.available < 1}><Plus className="me-2 h-4 w-4" />{c.add}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{c.member}</CardTitle><CardDescription>{capacity.occupied} {c.occupied} · {capacity.available} {c.available}</CardDescription></div>
          <div className="space-y-1"><Label>{c.futureBookings}</Label><select className="h-9 rounded-md border px-3" value={bookingPolicy} onChange={(e) => setBookingPolicy(e.target.value as any)}><option value="cancel">{c.cancelBookings}</option><option value="keep">{c.keepBookings}</option><option value="manual_review">{c.reviewBookings}</option></select></div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>{c.member}</TableHead><TableHead>{c.role}</TableHead><TableHead>{c.joined}</TableHead><TableHead>{c.status}</TableHead><TableHead>{c.restrictions}</TableHead><TableHead className="text-end">{c.actions}</TableHead></TableRow></TableHeader>
            <TableBody>
              {members.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-500">{c.noMembers}</TableCell></TableRow> : members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell><div className="font-medium">{member.firstName} {member.lastName}</div><div className="text-xs text-slate-500">{member.email || member.memberId}</div></TableCell>
                  <TableCell>{member.role === 'holder' ? c.holder : c.beneficiary}</TableCell>
                  <TableCell>{member.joinedAt ? String(member.joinedAt).slice(0, 10) : '—'}</TableCell>
                  <TableCell><Badge variant={member.status === 'active' ? 'default' : 'secondary'}>{member.status}</Badge></TableCell>
                  <TableCell className="max-w-56 truncate">{member.restrictions?.notes || '—'}</TableCell>
                  <TableCell className="text-end">
                    {member.role !== 'holder' && <div className="flex justify-end gap-1">
                      {member.status !== 'active' && <Button size="sm" variant="outline" onClick={() => updateStatus(member, 'active')}>{c.activate}</Button>}
                      {member.status === 'active' && <Button size="sm" variant="outline" onClick={() => updateStatus(member, 'suspended')}>{c.suspend}</Button>}
                      {member.status !== 'removed' && <Button size="sm" variant="destructive" onClick={() => updateStatus(member, 'removed')}>{c.remove}</Button>}
                    </div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{c.add}</DialogTitle></DialogHeader>
          <form onSubmit={addMember} className="space-y-4">
            <div className="grid grid-cols-2 gap-2"><Button type="button" variant={form.mode === 'existing' ? 'default' : 'outline'} onClick={() => setForm({ ...form, mode: 'existing' })}>{c.existing}</Button><Button type="button" variant={form.mode === 'new' ? 'default' : 'outline'} onClick={() => setForm({ ...form, mode: 'new' })}>{c.createNew}</Button></div>
            {form.mode === 'existing' ? <div className="space-y-2"><Label>{c.memberId}</Label><Input value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} required /></div> : <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>{c.firstName}</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div><div className="space-y-2"><Label>{c.lastName}</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div><div className="space-y-2"><Label>{c.email}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div><div className="space-y-2"><Label>{c.phone}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div></div>}
            <div className="space-y-2"><Label>{c.joinedAt}</Label><DateInput value={form.joinedAt} onChange={(value) => setForm({ ...form, joinedAt: value })} /></div>
            <div className="space-y-2"><Label>{c.restrictions}</Label><Input value={form.restrictions} onChange={(e) => setForm({ ...form, restrictions: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAddOpen(false)}>{c.cancel}</Button><Button type="submit">{c.save}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={datesOpen} onOpenChange={setDatesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{c.editDates}</DialogTitle></DialogHeader>
          <form onSubmit={updateDates} className="space-y-4">
            <div className="space-y-2"><Label>{c.startDate}</Label><DateInput value={dateForm.startDate} onChange={(value) => setDateForm((current) => ({ ...current, startDate: value }))} /></div>
            <div className="space-y-2"><Label>{c.endDate}</Label><DateInput value={dateForm.endDate} onChange={(value) => setDateForm((current) => ({ ...current, endDate: value }))} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDatesOpen(false)}>{c.cancel}</Button><Button type="submit">{c.saveDates}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{c.history}</DialogTitle></DialogHeader>
          <Table><TableHeader><TableRow><TableHead>{c.member}</TableHead><TableHead>{c.status}</TableHead><TableHead>{c.joined}</TableHead></TableRow></TableHeader><TableBody>{history.map((item) => <TableRow key={item.id}><TableCell>{item.memberId}</TableCell><TableCell>{item.previousStatus || '—'} → {item.newStatus || '—'}</TableCell><TableCell>{item.effectiveAt ? String(item.effectiveAt).slice(0, 19).replace('T', ' ') : '—'}</TableCell></TableRow>)}</TableBody></Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
