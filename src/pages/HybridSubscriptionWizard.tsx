import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import DateInput from '../components/DateInput';
import { useLocalization } from '../contexts/LocalizationContext';
import { membershipApi, type MembershipMember } from '../lib/membershipApi';
import { planManagementApi, type MaintenanceList, type ManagedPlan } from '../lib/planManagementApi';

type PersonDraft = {
  key: string;
  mode: 'existing' | 'new';
  memberId?: string;
  displayName: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  joinedAt?: string;
  restrictions?: string;
};

const copy = {
  en: {
    title: 'New multi-user subscription', subtitle: 'Guided setup now, flexible management after confirmation.',
    back: 'Membership plans', holder: 'Holder', plan: 'Plan', members: 'Members', confirm: 'Confirm', done: 'Created',
    existingHolder: 'Select existing holder', newHolder: 'Create new holder', search: 'Search by name, email, phone or ID',
    searchButton: 'Search', selected: 'Selected', firstName: 'First name', lastName: 'Last name', email: 'Email',
    phone: 'Phone', next: 'Next', previous: 'Previous', choosePlan: 'Choose a family, group or corporate plan',
    startDate: 'Start date', endDate: 'End date', capacity: 'Maximum members', addNowQuestion: 'Add members now?',
    addNowDescription: 'You can add existing members or create new members before confirmation.',
    yesNow: 'Yes, add members now', later: 'Complete later', addExisting: 'Add existing member',
    addNew: 'Create new member', addMember: 'Add member', joinDate: 'Join date', restrictions: 'Member restrictions',
    noMembers: 'No beneficiaries added yet.', places: 'places', occupied: 'occupied', available: 'available',
    days: 'days',
    review: 'Review subscription', holderSummary: 'Holder', planSummary: 'Selected plan', memberSummary: 'Initial members',
    confirmationNote: 'The subscription, holder and initial members will be saved together in one transaction.',
    create: 'Confirm and create subscription', creating: 'Creating subscription...', success: 'Subscription created successfully',
    successDescription: 'The multi-user subscription is ready. You can continue managing members, dates, history and capacity.',
    manage: 'Manage subscription', another: 'Create another subscription', required: 'Complete the required information.',
    duplicate: 'This person is already included.', planUnavailable: 'No active multi-user plans are available.',
  },
  ar: {
    title: 'اشتراك جديد متعدد المستخدمين', subtitle: 'إعداد موجه الآن وإدارة مرنة بعد التأكيد.',
    back: 'خطط العضوية', holder: 'المسؤول', plan: 'الخطة', members: 'الأعضاء', confirm: 'التأكيد', done: 'تم الإنشاء',
    existingHolder: 'اختيار مسؤول موجود', newHolder: 'إنشاء مسؤول جديد', search: 'البحث بالاسم أو البريد أو الهاتف أو المعرف',
    searchButton: 'بحث', selected: 'تم الاختيار', firstName: 'الاسم', lastName: 'اسم العائلة', email: 'البريد الإلكتروني',
    phone: 'الهاتف', next: 'التالي', previous: 'السابق', choosePlan: 'اختر خطة عائلية أو جماعية أو خطة شركات',
    startDate: 'تاريخ البداية', endDate: 'تاريخ النهاية', capacity: 'الحد الأقصى للأعضاء', addNowQuestion: 'هل تريد إضافة الأعضاء الآن؟',
    addNowDescription: 'يمكنك إضافة أعضاء موجودين أو إنشاء أعضاء جدد قبل التأكيد.',
    yesNow: 'نعم، إضافة الأعضاء الآن', later: 'الإكمال لاحقاً', addExisting: 'إضافة عضو موجود',
    addNew: 'إنشاء عضو جديد', addMember: 'إضافة العضو', joinDate: 'تاريخ الانضمام', restrictions: 'قيود العضو',
    noMembers: 'لم تتم إضافة مستفيدين بعد.', places: 'أماكن', occupied: 'مشغولة', available: 'متاحة',
    days: 'يوم',
    review: 'مراجعة الاشتراك', holderSummary: 'المسؤول', planSummary: 'الخطة المختارة', memberSummary: 'الأعضاء الأوليون',
    confirmationNote: 'سيتم حفظ الاشتراك والمسؤول والأعضاء الأوليين معاً في معاملة واحدة.',
    create: 'تأكيد وإنشاء الاشتراك', creating: 'جار إنشاء الاشتراك...', success: 'تم إنشاء الاشتراك بنجاح',
    successDescription: 'الاشتراك متعدد المستخدمين جاهز. يمكنك متابعة إدارة الأعضاء والتواريخ والسجل والسعة.',
    manage: 'إدارة الاشتراك', another: 'إنشاء اشتراك آخر', required: 'أكمل المعلومات المطلوبة.',
    duplicate: 'هذا الشخص مضاف بالفعل.', planUnavailable: 'لا توجد خطط نشطة متعددة المستخدمين.',
  },
} as const;

function addDays(start: string, days: number) {
  if (!start) return '';
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(1, days));
  return date.toISOString().slice(0, 10);
}

function personFromMember(member: MembershipMember): PersonDraft {
  return {
    key: `existing:${member.id}`, mode: 'existing', memberId: member.id,
    displayName: `${member.firstName} ${member.lastName}`.trim(), email: member.email, phone: member.phone,
  };
}

export default function HybridSubscriptionWizard() {
  const { locale, formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const c = locale === 'ar' ? copy.ar : copy.en;
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<ManagedPlan[]>([]);
  const [lists, setLists] = useState<MaintenanceList[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [holderMode, setHolderMode] = useState<'existing' | 'new'>('existing');
  const [holder, setHolder] = useState<PersonDraft | null>(null);
  const [holderNew, setHolderNew] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MembershipMember[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [addNow, setAddNow] = useState<boolean | null>(null);
  const [members, setMembers] = useState<PersonDraft[]>([]);
  const [memberDialog, setMemberDialog] = useState(false);
  const [memberMode, setMemberMode] = useState<'existing' | 'new'>('existing');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MembershipMember[]>([]);
  const [memberNew, setMemberNew] = useState({ firstName: '', lastName: '', email: '', phone: '', joinedAt: startDate, restrictions: '' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<any>(null);

  useEffect(() => {
    Promise.all([planManagementApi.listPlans(), planManagementApi.listMaintenance()])
      .then(([plansResponse, listsResponse]) => {
        setPlans(plansResponse.plans.filter((plan) => plan.status === 'active' && plan.planType !== 'individual'));
        setLists(listsResponse.lists);
      })
      .catch((error) => toast.error(error.message));
  }, []);

  const selectedPlan = useMemo(() => plans.find((plan) => plan.planVersionId === selectedPlanId) || null, [plans, selectedPlanId]);
  const planTypeLabel = (code: string) => {
    const item = lists.find((list) => list.key === 'plan_type')?.items.find((entry) => entry.code === code && entry.status === 'active');
    return item ? (locale === 'ar' ? item.labelAr : item.labelEn) : code;
  };
  const totalOccupied = 1 + members.length;
  const available = Math.max(0, (selectedPlan?.maxMembers || 1) - totalOccupied);

  const searchMembers = async (query: string, target: 'holder' | 'member') => {
    if (!query.trim()) return;
    try {
      const response = await membershipApi.listMembers({ search: query.trim(), status: 'active' });
      if (target === 'holder') setResults(response.members);
      else setMemberResults(response.members);
    } catch (error: any) { toast.error(error?.message || c.required); }
  };

  const choosePlan = (plan: ManagedPlan) => {
    setSelectedPlanId(plan.planVersionId);
    setEndDate(addDays(startDate, plan.durationDays));
  };

  const setStartAndEnd = (value: string) => {
    setStartDate(value);
    if (selectedPlan) setEndDate(addDays(value, selectedPlan.durationDays));
    setMemberNew((current) => ({ ...current, joinedAt: value }));
  };

  const holderReady = holderMode === 'existing'
    ? Boolean(holder?.memberId)
    : Boolean(holderNew.firstName.trim() && holderNew.lastName.trim() && holderNew.email.trim());

  const next = () => {
    if (step === 1 && !holderReady) return toast.error(c.required);
    if (step === 2 && (!selectedPlan || !startDate || !endDate)) return toast.error(c.required);
    if (step === 3 && addNow === null) return toast.error(c.required);
    setStep((current) => Math.min(4, current + 1));
  };

  const isDuplicate = (candidate: PersonDraft) => {
    const holderId = holderMode === 'existing' ? holder?.memberId : undefined;
    const holderEmail = (holderMode === 'existing' ? holder?.email : holderNew.email)?.toLowerCase();
    return Boolean(
      (candidate.memberId && candidate.memberId === holderId) ||
      (candidate.email && (
        candidate.email.toLowerCase() === holderEmail ||
        members.some((member) =>
          member.email.toLowerCase() === candidate.email.toLowerCase() ||
          Boolean(candidate.memberId && member.memberId === candidate.memberId),
        )
      )),
    );
  };

  const addExistingMember = (member: MembershipMember) => {
    const candidate = { ...personFromMember(member), joinedAt: startDate, restrictions: '' };
    if (isDuplicate(candidate)) return toast.error(c.duplicate);
    setMembers((current) => [...current, candidate]);
    setMemberDialog(false);
  };

  const addNewMember = () => {
    if (!memberNew.firstName.trim() || !memberNew.lastName.trim() || !memberNew.email.trim()) return toast.error(c.required);
    const candidate: PersonDraft = {
      key: `new:${globalThis.crypto.randomUUID()}`, mode: 'new',
      displayName: `${memberNew.firstName} ${memberNew.lastName}`.trim(),
      firstName: memberNew.firstName, lastName: memberNew.lastName,
      email: memberNew.email, phone: memberNew.phone, joinedAt: memberNew.joinedAt || startDate,
      restrictions: memberNew.restrictions,
    };
    if (isDuplicate(candidate)) return toast.error(c.duplicate);
    setMembers((current) => [...current, candidate]);
    setMemberNew({ firstName: '', lastName: '', email: '', phone: '', joinedAt: startDate, restrictions: '' });
    setMemberDialog(false);
  };

  const submit = async () => {
    if (!selectedPlan || !holderReady || addNow === null) return toast.error(c.required);
    setSaving(true);
    try {
      const response = await planManagementApi.createHybridSubscription({
        planVersionId: selectedPlan.planVersionId,
        holder: holderMode === 'existing'
          ? { memberId: holder?.memberId }
          : { newMember: holderNew },
        startDate,
        endDate,
        addMembersNow: addNow,
        members: addNow ? members.map((member) => ({
          memberId: member.mode === 'existing' ? member.memberId : undefined,
          newMember: member.mode === 'new' ? {
            firstName: member.firstName || '', lastName: member.lastName || '',
            email: member.email, phone: member.phone,
          } : undefined,
          joinedAt: member.joinedAt || startDate,
          restrictions: member.restrictions ? { notes: member.restrictions } : {},
        })) : [],
      });
      setCreated(response);
      setStep(5);
    } catch (error: any) { toast.error(error?.message || c.required); }
    finally { setSaving(false); }
  };

  const reset = () => {
    setStep(1); setHolder(null); setHolderNew({ firstName: '', lastName: '', email: '', phone: '' });
    setSelectedPlanId(''); setAddNow(null); setMembers([]); setCreated(null);
  };

  const steps = [c.holder, c.plan, c.members, c.confirm, c.done];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-slate-900">{c.title}</h1><p className="text-sm text-slate-500">{c.subtitle}</p></div>
        <Button variant="outline" asChild><Link to="/plans"><ArrowLeft className="me-2 h-4 w-4" />{c.back}</Link></Button>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {steps.map((label, index) => {
          const value = index + 1;
          return <div key={label} className="text-center"><div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold ${step >= value ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>{step > value ? <Check className="h-4 w-4" /> : value}</div><div className="mt-1 hidden text-xs text-slate-600 sm:block">{label}</div></div>;
        })}
      </div>

      {step === 1 && <Card>
        <CardHeader><CardTitle>{c.holder}</CardTitle><CardDescription>{c.existingHolder} / {c.newHolder}</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant={holderMode === 'existing' ? 'default' : 'outline'} onClick={() => setHolderMode('existing')}>{c.existingHolder}</Button><Button type="button" variant={holderMode === 'new' ? 'default' : 'outline'} onClick={() => setHolderMode('new')}>{c.newHolder}</Button></div>
          {holderMode === 'existing' ? <div className="space-y-3">
            <div className="flex gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={c.search} onKeyDown={(event) => event.key === 'Enter' && searchMembers(search, 'holder')} /><Button onClick={() => searchMembers(search, 'holder')}><Search className="me-2 h-4 w-4" />{c.searchButton}</Button></div>
            <div className="grid gap-2 md:grid-cols-2">{results.map((member) => <button key={member.id} type="button" onClick={() => setHolder(personFromMember(member))} className={`rounded-lg border p-3 text-start ${holder?.memberId === member.id ? 'border-indigo-600 bg-indigo-50' : 'hover:bg-slate-50'}`}><div className="font-medium">{member.firstName} {member.lastName}</div><div className="text-xs text-slate-500">{member.email} · {member.id}</div>{holder?.memberId === member.id && <Badge className="mt-2">{c.selected}</Badge>}</button>)}</div>
          </div> : <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>{c.firstName}</Label><Input value={holderNew.firstName} onChange={(e) => setHolderNew({ ...holderNew, firstName: e.target.value })} /></div>
            <div className="space-y-2"><Label>{c.lastName}</Label><Input value={holderNew.lastName} onChange={(e) => setHolderNew({ ...holderNew, lastName: e.target.value })} /></div>
            <div className="space-y-2"><Label>{c.email}</Label><Input type="email" value={holderNew.email} onChange={(e) => setHolderNew({ ...holderNew, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>{c.phone}</Label><Input value={holderNew.phone} onChange={(e) => setHolderNew({ ...holderNew, phone: e.target.value })} /></div>
          </div>}
        </CardContent>
      </Card>}

      {step === 2 && <Card>
        <CardHeader><CardTitle>{c.choosePlan}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {plans.length === 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">{c.planUnavailable}</div> : <div className="grid gap-3 md:grid-cols-3">{plans.map((plan) => <button type="button" key={plan.planVersionId} onClick={() => choosePlan(plan)} className={`rounded-xl border p-4 text-start ${selectedPlanId === plan.planVersionId ? 'border-indigo-600 bg-indigo-50' : 'hover:bg-slate-50'}`}><Badge variant="outline">{planTypeLabel(plan.planType)}</Badge><div className="mt-2 font-semibold">{plan.name}</div><div className="text-sm text-slate-500">{formatCurrency(plan.price, plan.currency)} · {plan.durationDays} {c.days}</div><div className="mt-2 text-xs">{c.capacity}: {plan.maxMembers}</div></button>)}</div>}
          <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>{c.startDate}</Label><DateInput value={startDate} onChange={setStartAndEnd} /></div><div className="space-y-2"><Label>{c.endDate}</Label><DateInput value={endDate} onChange={setEndDate} /></div></div>
        </CardContent>
      </Card>}

      {step === 3 && <Card>
        <CardHeader><CardTitle>{c.addNowQuestion}</CardTitle><CardDescription>{c.addNowDescription}</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2"><button type="button" onClick={() => setAddNow(true)} className={`rounded-xl border p-5 text-start ${addNow === true ? 'border-emerald-600 bg-emerald-50' : ''}`}><UserPlus className="mb-2 h-6 w-6 text-emerald-600" /><div className="font-semibold">{c.yesNow}</div></button><button type="button" onClick={() => setAddNow(false)} className={`rounded-xl border p-5 text-start ${addNow === false ? 'border-amber-500 bg-amber-50' : ''}`}><ChevronRight className="mb-2 h-6 w-6 text-amber-600" /><div className="font-semibold">{c.later}</div></button></div>
          {addNow && <div className="space-y-3">
            <div className="flex items-center justify-between"><div className="text-sm"><strong>{totalOccupied}/{selectedPlan?.maxMembers}</strong> {c.occupied} · <strong>{available}</strong> {c.available}</div><Button onClick={() => setMemberDialog(true)} disabled={available < 1}><Plus className="me-2 h-4 w-4" />{c.addMember}</Button></div>
            {members.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-slate-500">{c.noMembers}</div> : members.map((member) => <div key={member.key} className="flex items-center justify-between rounded-lg border p-3"><div><div className="font-medium">{member.displayName}</div><div className="text-xs text-slate-500">{member.email} · {member.mode === 'existing' ? c.addExisting : c.addNew}</div></div><Button size="icon" variant="ghost" onClick={() => setMembers((current) => current.filter((item) => item.key !== member.key))}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>)}
          </div>}
        </CardContent>
      </Card>}

      {step === 4 && <Card>
        <CardHeader><CardTitle>{c.review}</CardTitle><CardDescription>{c.confirmationNote}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3"><div className="rounded-lg bg-slate-50 p-4"><div className="text-xs text-slate-500">{c.holderSummary}</div><div className="font-semibold">{holderMode === 'existing' ? holder?.displayName : `${holderNew.firstName} ${holderNew.lastName}`}</div><div className="text-xs">{holderMode === 'existing' ? holder?.email : holderNew.email}</div></div><div className="rounded-lg bg-slate-50 p-4"><div className="text-xs text-slate-500">{c.planSummary}</div><div className="font-semibold">{selectedPlan?.name}</div><div className="text-xs">{selectedPlan ? planTypeLabel(selectedPlan.planType) : ''} · {startDate} → {endDate}</div></div><div className="rounded-lg bg-slate-50 p-4"><div className="text-xs text-slate-500">{c.memberSummary}</div><div className="font-semibold">{addNow ? members.length : 0}</div><div className="text-xs">{addNow ? `${totalOccupied}/${selectedPlan?.maxMembers} ${c.occupied}` : c.later}</div></div></div>
          {addNow && members.map((member) => <div key={member.key} className="flex items-center gap-3 rounded-lg border p-3"><Users className="h-4 w-4 text-indigo-600" /><div><div className="font-medium">{member.displayName}</div><div className="text-xs text-slate-500">{member.email}</div></div></div>)}
        </CardContent>
      </Card>}

      {step === 5 && created && <Card className="border-emerald-200">
        <CardContent className="py-12 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><Check className="h-8 w-8 text-emerald-700" /></div><h2 className="mt-4 text-2xl font-bold">{c.success}</h2><p className="mx-auto mt-2 max-w-xl text-slate-500">{c.successDescription}</p><div className="mt-3 text-sm"><strong>{created.subscription.planName}</strong> · {created.capacity.occupied}/{created.capacity.maximum} {c.occupied}</div><div className="mt-6 flex justify-center gap-2"><Button onClick={() => navigate(`/plans/multi-user?subscriptionId=${encodeURIComponent(created.subscription.id)}`)}>{c.manage}</Button><Button variant="outline" onClick={reset}>{c.another}</Button></div></CardContent>
      </Card>}

      {step < 5 && <div className="flex justify-between"><Button variant="outline" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}><ChevronLeft className="me-2 h-4 w-4" />{c.previous}</Button>{step < 4 ? <Button onClick={next}>{c.next}<ChevronRight className="ms-2 h-4 w-4" /></Button> : <Button onClick={submit} disabled={saving}>{saving ? c.creating : c.create}</Button>}</div>}

      <Dialog open={memberDialog} onOpenChange={setMemberDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{c.addMember}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2"><Button variant={memberMode === 'existing' ? 'default' : 'outline'} onClick={() => setMemberMode('existing')}>{c.addExisting}</Button><Button variant={memberMode === 'new' ? 'default' : 'outline'} onClick={() => setMemberMode('new')}>{c.addNew}</Button></div>
          {memberMode === 'existing' ? <div className="space-y-3"><div className="flex gap-2"><Input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={c.search} /><Button onClick={() => searchMembers(memberSearch, 'member')}><Search className="h-4 w-4" /></Button></div><div className="max-h-72 space-y-2 overflow-y-auto">{memberResults.map((member) => <button type="button" key={member.id} onClick={() => addExistingMember(member)} className="w-full rounded-lg border p-3 text-start hover:bg-slate-50"><div className="font-medium">{member.firstName} {member.lastName}</div><div className="text-xs text-slate-500">{member.email} · {member.id}</div></button>)}</div></div> : <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>{c.firstName}</Label><Input value={memberNew.firstName} onChange={(e) => setMemberNew({ ...memberNew, firstName: e.target.value })} /></div><div className="space-y-2"><Label>{c.lastName}</Label><Input value={memberNew.lastName} onChange={(e) => setMemberNew({ ...memberNew, lastName: e.target.value })} /></div><div className="space-y-2"><Label>{c.email}</Label><Input type="email" value={memberNew.email} onChange={(e) => setMemberNew({ ...memberNew, email: e.target.value })} /></div><div className="space-y-2"><Label>{c.phone}</Label><Input value={memberNew.phone} onChange={(e) => setMemberNew({ ...memberNew, phone: e.target.value })} /></div><div className="space-y-2"><Label>{c.joinDate}</Label><DateInput value={memberNew.joinedAt} onChange={(value) => setMemberNew({ ...memberNew, joinedAt: value })} /></div><div className="space-y-2"><Label>{c.restrictions}</Label><Input value={memberNew.restrictions} onChange={(e) => setMemberNew({ ...memberNew, restrictions: e.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button onClick={addNewMember}>{c.addMember}</Button></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
