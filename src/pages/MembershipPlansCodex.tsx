import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, RefreshCw, Users, CalendarDays, Infinity as InfinityIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import DateInput from '../components/DateInput';
import InlineAlert from '../components/InlineAlert';
import EmptyState from '../components/EmptyState';
import { useLocalization } from '../contexts/LocalizationContext';
import { planManagementApi, type MaintenanceList, type ManagedPlan, type TrainerOption } from '../lib/planManagementApi';

const copy = {
  en: {
    title: 'Membership Plans',
    subtitle: 'Versioned individual and multi-user plans with configurable benefits, limits and lifecycle.',
    refresh: 'Refresh',
    newPlan: 'New plan',
    listMaintenance: 'List maintenance',
    manageMembers: 'Manage multi-user memberships',
    newMultiSubscription: 'New multi-user subscription',
    trainerCommissions: 'Trainer commissions',
    assignedTrainer: 'Responsible trainer',
    noTrainer: 'No trainer assigned',
    commissionPercent: 'Trainer commission (%)',
    gymShare: 'The remaining percentage is allocated to the gym. Commissions are tracked separately from fixed salary.',
    total: 'Total plans',
    active: 'Active plans',
    multiUser: 'Multi-user plans',
    name: 'Name',
    description: 'Description',
    type: 'Plan type',
    duration: 'Duration',
    price: 'Price',
    members: 'Members',
    sessions: 'Sessions',
    status: 'Status',
    actions: 'Actions',
    days: 'days',
    unlimited: 'Unlimited',
    noPlans: 'No membership plans',
    noPlansDescription: 'Create the first versioned membership plan.',
    create: 'Create plan',
    edit: 'Edit plan',
    save: 'Save plan',
    saving: 'Saving...',
    cancel: 'Cancel',
    currency: 'Currency',
    durationDays: 'Duration (days)',
    startDate: 'Validity start',
    endDate: 'Validity end',
    maxMembers: 'Maximum members',
    sessionsUnlimited: 'Open sessions without limit',
    sessionsPerCycle: 'Sessions per cycle',
    cycleFrequency: 'Cycle frequency',
    distribution: 'Benefit distribution',
    holderSessions: 'Holder sessions per cycle',
    beneficiarySessions: 'Beneficiary sessions per cycle',
    carryover: 'Carry unused sessions forward',
    carryoverMax: 'Maximum accumulated sessions',
    carryoverExpiry: 'Accumulated-session expiry (days)',
    extraSessions: 'Allow additional session purchases',
    extraSessionPrice: 'Additional session price',
    deductionMoment: 'Session deduction moment',
    cancellationWindow: 'Free cancellation window (minutes)',
    autoRefund: 'Automatically return an on-time cancellation',
    lateCancellationThreshold: 'Late cancellations before penalty',
    lateCancellationPenalty: 'Sessions lost per penalty',
    noShowConsumes: 'Consume a session on no-show',
    rescheduling: 'Allow rescheduling',
    staffExceptions: 'Allow staff exceptions',
    gymCancellationRefund: 'Return session when the gym cancels',
    sharedBenefits: 'All members share the same benefits',
    benefits: 'Benefits (one per line)',
    restrictions: 'Restrictions (one per line)',
    bookingPolicy: 'When a member leaves',
    version: 'Version',
    loadError: 'Unable to load plan management data.',
    validation: 'Review the required fields and plan limits.',
    individualRule: 'Individual plans always have one member.',
    multiRule: 'Every plan may be unlimited or use shared, individual or custom session allocation.',
  },
  ar: {
    title: 'خطط العضوية',
    subtitle: 'خطط فردية ومتعددة المستخدمين بإصدارات ومزايا وحدود ودورة حياة قابلة للإعداد.',
    refresh: 'تحديث',
    newPlan: 'خطة جديدة',
    listMaintenance: 'صيانة القوائم',
    manageMembers: 'إدارة العضويات متعددة المستخدمين',
    newMultiSubscription: 'اشتراك جديد متعدد المستخدمين',
    trainerCommissions: 'عمولات المدربين',
    assignedTrainer: 'المدرب المسؤول',
    noTrainer: 'لا يوجد مدرب معين',
    commissionPercent: 'عمولة المدرب (%)',
    gymShare: 'تُخصص النسبة المتبقية للنادي. وتُتابع العمولات بشكل منفصل عن الراتب الثابت.',
    total: 'إجمالي الخطط',
    active: 'الخطط النشطة',
    multiUser: 'الخطط متعددة المستخدمين',
    name: 'الاسم',
    description: 'الوصف',
    type: 'نوع الخطة',
    duration: 'المدة',
    price: 'السعر',
    members: 'الأعضاء',
    sessions: 'الجلسات',
    status: 'الحالة',
    actions: 'الإجراءات',
    days: 'يوم',
    unlimited: 'غير محدودة',
    noPlans: 'لا توجد خطط عضوية',
    noPlansDescription: 'أنشئ أول خطة عضوية بإصدار.',
    create: 'إنشاء الخطة',
    edit: 'تعديل الخطة',
    save: 'حفظ الخطة',
    saving: 'جار الحفظ...',
    cancel: 'إلغاء',
    currency: 'العملة',
    durationDays: 'المدة بالأيام',
    startDate: 'بداية الصلاحية',
    endDate: 'نهاية الصلاحية',
    maxMembers: 'الحد الأقصى للأعضاء',
    sessionsUnlimited: 'جلسات مفتوحة بلا حد',
    sessionsPerCycle: 'الجلسات في كل دورة',
    cycleFrequency: 'دورية الدورة',
    distribution: 'توزيع المزايا',
    holderSessions: 'جلسات صاحب الاشتراك في كل دورة',
    beneficiarySessions: 'جلسات كل مستفيد في الدورة',
    carryover: 'ترحيل الجلسات غير المستخدمة',
    carryoverMax: 'الحد الأقصى للجلسات المتراكمة',
    carryoverExpiry: 'صلاحية الجلسات المتراكمة بالأيام',
    extraSessions: 'السماح بشراء جلسات إضافية',
    extraSessionPrice: 'سعر الجلسة الإضافية',
    deductionMoment: 'وقت خصم الجلسة',
    cancellationWindow: 'مهلة الإلغاء المجاني بالدقائق',
    autoRefund: 'إرجاع جلسة الإلغاء ضمن المهلة تلقائياً',
    lateCancellationThreshold: 'عدد الإلغاءات المتأخرة قبل العقوبة',
    lateCancellationPenalty: 'الجلسات المخصومة عند العقوبة',
    noShowConsumes: 'احتساب جلسة عند عدم الحضور',
    rescheduling: 'السماح بإعادة الجدولة',
    staffExceptions: 'السماح باستثناءات الموظفين',
    gymCancellationRefund: 'إرجاع الجلسة عند إلغاء النادي',
    sharedBenefits: 'جميع الأعضاء يتشاركون المزايا نفسها',
    benefits: 'المزايا (ميزة في كل سطر)',
    restrictions: 'القيود (قيد في كل سطر)',
    bookingPolicy: 'عند مغادرة العضو',
    version: 'الإصدار',
    loadError: 'تعذر تحميل بيانات إدارة الخطط.',
    validation: 'راجع الحقول المطلوبة وحدود الخطة.',
    individualRule: 'الخطة الفردية مخصصة لعضو واحد.',
    multiRule: 'يمكن أن تكون أي خطة غير محدودة أو ذات توزيع مشترك أو فردي أو مخصص للجلسات.',
  },
} as const;

type FormState = {
  id: string;
  name: string;
  description: string;
  trainerId: string;
  trainerCommissionPercent: string;
  planType: string;
  price: string;
  currency: string;
  durationDays: string;
  validFrom: string;
  validTo: string;
  maxMembers: string;
  sessionsUnlimited: boolean;
  sessionsPerCycle: string;
  cycleFrequency: string;
  distributionModel: string;
  holderSessionsPerCycle: string;
  beneficiarySessionsPerCycle: string;
  carryoverEnabled: boolean;
  carryoverMax: string;
  carryoverExpiryDays: string;
  allowExtraSessions: boolean;
  extraSessionPrice: string;
  deductionMoment: string;
  cancellationWindowMinutes: string;
  autoRefundOnTime: boolean;
  lateCancellationThreshold: string;
  lateCancellationPenalty: string;
  noShowConsumesSession: boolean;
  reschedulingAllowed: boolean;
  staffExceptionsAllowed: boolean;
  gymCancellationRefund: boolean;
  sharedBenefits: boolean;
  futureBookingPolicy: string;
  benefits: string;
  restrictions: string;
  status: string;
};

const emptyForm: FormState = {
  id: '', name: '', description: '', planType: 'individual', price: '0', currency: 'USD',
  trainerId: '', trainerCommissionPercent: '0',
  durationDays: '30', validFrom: '', validTo: '', maxMembers: '1',
  sessionsUnlimited: true, sessionsPerCycle: '', cycleFrequency: 'monthly',
  distributionModel: 'individual', sharedBenefits: true, futureBookingPolicy: 'cancel',
  holderSessionsPerCycle: '', beneficiarySessionsPerCycle: '',
  carryoverEnabled: false, carryoverMax: '', carryoverExpiryDays: '30',
  allowExtraSessions: false, extraSessionPrice: '',
  deductionMoment: 'booking_confirmation', cancellationWindowMinutes: '120',
  autoRefundOnTime: true, lateCancellationThreshold: '2', lateCancellationPenalty: '1',
  noShowConsumesSession: true, reschedulingAllowed: true,
  staffExceptionsAllowed: true, gymCancellationRefund: true,
  benefits: '', restrictions: '', status: 'draft',
};

function toLines(value: Record<string, unknown>) {
  const items = Array.isArray((value as any)?.items) ? (value as any).items : [];
  return items.join('\n');
}

function fromLines(value: string) {
  return { items: value.split('\n').map((line) => line.trim()).filter(Boolean) };
}

export default function MembershipPlansCodex() {
  const { locale, formatCurrency } = useLocalization();
  const c = locale === 'ar' ? copy.ar : copy.en;
  const [plans, setPlans] = useState<ManagedPlan[]>([]);
  const [lists, setLists] = useState<MaintenanceList[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const labels = (key: string, fallback: Array<{ code: string; en: string; ar: string }>) => {
    const list = lists.find((item) => item.key === key);
    if (!list) return fallback.map((item) => ({ code: item.code, label: locale === 'ar' ? item.ar : item.en }));
    return list.items.filter((item) => item.status === 'active').map((item) => ({
      code: item.code,
      label: locale === 'ar' ? item.labelAr : item.labelEn,
    }));
  };

  const planTypes = labels('plan_type', [
    { code: 'individual', en: 'Individual', ar: 'فردية' },
    { code: 'family', en: 'Family', ar: 'عائلية' },
    { code: 'group', en: 'Group', ar: 'جماعية' },
    { code: 'corporate', en: 'Corporate', ar: 'شركات' },
  ]);
  const statuses = labels('plan_status', [
    { code: 'draft', en: 'Draft', ar: 'مسودة' },
    { code: 'active', en: 'Active', ar: 'نشطة' },
    { code: 'suspended', en: 'Suspended', ar: 'معلقة' },
    { code: 'cancelled', en: 'Cancelled', ar: 'ملغاة' },
    { code: 'archived', en: 'Archived', ar: 'مؤرشفة' },
  ]);
  const cycles = labels('cycle_frequency', [
    { code: 'monthly', en: 'Monthly from subscription start', ar: 'شهرياً من بداية الاشتراك' },
    { code: 'weekly', en: 'Weekly', ar: 'أسبوعياً' },
    { code: 'quarterly', en: 'Quarterly', ar: 'ربع سنوي' },
    { code: 'plan_duration', en: 'Full plan duration', ar: 'مدة الخطة كاملة' },
  ]);
  const distributions = labels('distribution_model', [
    { code: 'individual', en: 'Individual allocation', ar: 'تخصيص فردي' },
    { code: 'shared', en: 'Shared benefits', ar: 'مزايا مشتركة' },
    { code: 'custom', en: 'Member exceptions', ar: 'استثناءات حسب العضو' },
  ]);
  const bookingPolicies = labels('future_booking_policy', [
    { code: 'cancel', en: 'Cancel future bookings', ar: 'إلغاء الحجوزات المستقبلية' },
    { code: 'keep', en: 'Keep future bookings', ar: 'الإبقاء على الحجوزات المستقبلية' },
    { code: 'manual_review', en: 'Send to manual review', ar: 'إرسال للمراجعة اليدوية' },
  ]);
  const deductionMoments = labels('deduction_moment', [
    { code: 'reservation', en: 'When booking', ar: 'عند الحجز' },
    { code: 'booking_confirmation', en: 'When booking is confirmed', ar: 'عند تأكيد الحجز' },
    { code: 'check_in', en: 'At check-in', ar: 'عند تسجيل الدخول' },
    { code: 'service_start', en: 'When the activity starts', ar: 'عند بدء النشاط' },
    { code: 'attendance_confirmation', en: 'When attendance is confirmed', ar: 'عند تأكيد الحضور' },
    { code: 'service_completion', en: 'When the activity finishes', ar: 'عند انتهاء النشاط' },
  ]);

  const labelFor = (options: Array<{ code: string; label: string }>, code: string) =>
    options.find((option) => option.code === code)?.label || code;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [plansResponse, listsResponse, trainersResponse] = await Promise.all([
        planManagementApi.listPlans(),
        planManagementApi.listMaintenance(),
        planManagementApi.listTrainers(),
      ]);
      setPlans(plansResponse.plans);
      setLists(listsResponse.lists);
      setTrainers(trainersResponse.trainers);
    } catch (loadError: any) {
      setError(loadError?.message || c.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeCount = useMemo(() => plans.filter((plan) => plan.status === 'active').length, [plans]);
  const multiUserCount = useMemo(() => plans.filter((plan) => plan.planType !== 'individual').length, [plans]);

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (plan: ManagedPlan) => {
    setForm({
      id: plan.id, name: plan.name, description: plan.description, planType: plan.planType,
      trainerId: plan.trainerId || '',
      trainerCommissionPercent: String(plan.trainerCommissionPercent || 0),
      price: String(plan.price), currency: plan.currency, durationDays: String(plan.durationDays),
      validFrom: plan.validFrom || '', validTo: plan.validTo || '', maxMembers: String(plan.maxMembers),
      sessionsUnlimited: plan.sessionsUnlimited, sessionsPerCycle: plan.sessionsPerCycle ? String(plan.sessionsPerCycle) : '',
      cycleFrequency: plan.cycleFrequency, distributionModel: plan.distributionModel,
      holderSessionsPerCycle: String(plan.holderSessionsPerCycle || ''),
      beneficiarySessionsPerCycle: String(plan.beneficiarySessionsPerCycle || ''),
      carryoverEnabled: plan.carryoverEnabled,
      carryoverMax: String(plan.carryoverMax ?? ''),
      carryoverExpiryDays: String(plan.carryoverExpiryDays ?? 30),
      allowExtraSessions: plan.allowExtraSessions,
      extraSessionPrice: String(plan.extraSessionPrice ?? ''),
      deductionMoment: plan.bookingPolicy?.deductionMoment || 'booking_confirmation',
      cancellationWindowMinutes: String(plan.bookingPolicy?.cancellationWindowMinutes ?? 120),
      autoRefundOnTime: plan.bookingPolicy?.autoRefundOnTime !== false,
      lateCancellationThreshold: String(plan.bookingPolicy?.lateCancellationThreshold ?? 2),
      lateCancellationPenalty: String(plan.bookingPolicy?.lateCancellationPenalty ?? 1),
      noShowConsumesSession: plan.bookingPolicy?.noShowConsumesSession !== false,
      reschedulingAllowed: plan.bookingPolicy?.reschedulingAllowed !== false,
      staffExceptionsAllowed: plan.bookingPolicy?.staffExceptionsAllowed !== false,
      gymCancellationRefund: plan.bookingPolicy?.gymCancellationRefund !== false,
      sharedBenefits: plan.sharedBenefits, futureBookingPolicy: plan.futureBookingPolicy,
      benefits: toLines(plan.benefits), restrictions: toLines(plan.restrictions), status: plan.status,
    });
    setOpen(true);
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'planType') {
        const individual = value === 'individual';
        next.maxMembers = individual ? '1' : (Number(current.maxMembers) > 1 ? current.maxMembers : '2');
        next.distributionModel = individual ? 'individual' : 'shared';
      }
      if (key === 'validFrom' && value && !current.validTo) {
        const start = new Date(`${value}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() + Math.max(1, Number(current.durationDays) || 30));
        next.validTo = start.toISOString().slice(0, 10);
      }
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const individual = form.planType === 'individual';
    if (
      !form.name.trim() ||
      Number(form.durationDays) < 1 ||
      Number(form.price) < 0 ||
      (!individual && Number(form.maxMembers) < 2) ||
      (!form.sessionsUnlimited && Number(form.sessionsPerCycle) < 1) ||
      Number(form.trainerCommissionPercent) < 0 ||
      Number(form.trainerCommissionPercent) > 100 ||
      (Number(form.trainerCommissionPercent) > 0 && !form.trainerId)
    ) {
      toast.error(c.validation);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name, description: form.description, planType: form.planType,
        trainerId: form.trainerId || null,
        trainerCommissionPercent: Number(form.trainerCommissionPercent || 0),
        price: Number(form.price), currency: form.currency, durationDays: Number(form.durationDays),
        validFrom: form.validFrom || null, validTo: form.validTo || null,
        maxMembers: individual ? 1 : Number(form.maxMembers),
        sessionsUnlimited: form.sessionsUnlimited,
        sessionsPerCycle: !form.sessionsUnlimited ? Number(form.sessionsPerCycle) : null,
        cycleFrequency: form.cycleFrequency,
        distributionModel: individual ? 'individual' : form.distributionModel,
        holderSessionsPerCycle: Number(form.holderSessionsPerCycle || form.sessionsPerCycle || 0),
        beneficiarySessionsPerCycle: Number(form.beneficiarySessionsPerCycle || form.sessionsPerCycle || 0),
        carryoverEnabled: !form.sessionsUnlimited && form.carryoverEnabled,
        carryoverMax: form.carryoverEnabled && form.carryoverMax ? Number(form.carryoverMax) : null,
        carryoverExpiryDays: form.carryoverEnabled ? Number(form.carryoverExpiryDays || 30) : null,
        allowExtraSessions: !form.sessionsUnlimited && form.allowExtraSessions,
        extraSessionPrice: form.allowExtraSessions ? Number(form.extraSessionPrice || 0) : null,
        deductionMoment: form.deductionMoment,
        cancellationWindowMinutes: Number(form.cancellationWindowMinutes || 0),
        autoRefundOnTime: form.autoRefundOnTime,
        lateCancellationThreshold: Number(form.lateCancellationThreshold || 2),
        lateCancellationPenalty: Number(form.lateCancellationPenalty || 1),
        noShowConsumesSession: form.noShowConsumesSession,
        reschedulingAllowed: form.reschedulingAllowed,
        staffExceptionsAllowed: form.staffExceptionsAllowed,
        gymCancellationRefund: form.gymCancellationRefund,
        sharedBenefits: individual ? true : form.sharedBenefits,
        futureBookingPolicy: form.futureBookingPolicy,
        benefits: fromLines(form.benefits), restrictions: fromLines(form.restrictions),
        status: form.status,
      };
      if (form.id) await planManagementApi.updatePlan(form.id, payload);
      else await planManagementApi.createPlan(payload);
      toast.success(form.id ? c.edit : c.create);
      setOpen(false);
      await load();
    } catch (saveError: any) {
      toast.error(saveError?.message || c.validation);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{c.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{c.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link to="/subscriptions/new-hybrid">{c.newMultiSubscription}</Link></Button>
          <Button variant="outline" asChild><Link to="/plans/multi-user">{c.manageMembers}</Link></Button>
          <Button variant="outline" asChild><Link to="/settings/list-maintenance">{c.listMaintenance}</Link></Button>
          <Button variant="outline" asChild><Link to="/trainer-commissions">{c.trainerCommissions}</Link></Button>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="me-2 h-4 w-4" />{c.refresh}</Button>
          <Button onClick={openCreate}><Plus className="me-2 h-4 w-4" />{c.newPlan}</Button>
        </div>
      </div>

      {error && <InlineAlert title={c.loadError} variant="warning">{error}</InlineAlert>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardDescription>{c.total}</CardDescription><CardTitle>{plans.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>{c.active}</CardDescription><CardTitle>{activeCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>{c.multiUser}</CardDescription><CardTitle>{multiUserCount}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{c.title}</CardTitle><CardDescription>{c.individualRule} {c.multiRule}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{c.name}</TableHead><TableHead>{c.type}</TableHead><TableHead>{c.duration}</TableHead>
              <TableHead>{c.price}</TableHead><TableHead>{c.members}</TableHead><TableHead>{c.sessions}</TableHead>
              <TableHead>{c.status}</TableHead><TableHead className="text-end">{c.actions}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!loading && plans.length === 0 ? (
                <TableRow><TableCell colSpan={8}><EmptyState compact title={c.noPlans} description={c.noPlansDescription} actionLabel={c.create} onAction={openCreate} /></TableCell></TableRow>
              ) : plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell><div className="font-medium">{plan.name}</div><div className="text-xs text-slate-500">{c.version} {plan.versionNumber}</div></TableCell>
                  <TableCell>{labelFor(planTypes, plan.planType)}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{plan.durationDays} {c.days}</span></TableCell>
                  <TableCell>{formatCurrency(plan.price, plan.currency)}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{plan.maxMembers}</span></TableCell>
                  <TableCell>{plan.sessionsUnlimited ? <span className="inline-flex items-center gap-1"><InfinityIcon className="h-4 w-4" />{c.unlimited}</span> : `${plan.sessionsPerCycle} / ${labelFor(cycles, plan.cycleFrequency)} · ${labelFor(distributions, plan.distributionModel)}`}</TableCell>
                  <TableCell><Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>{labelFor(statuses, plan.status)}</Badge></TableCell>
                  <TableCell className="text-end"><Button variant="outline" size="sm" onClick={() => openEdit(plan)}><Pencil className="me-2 h-3.5 w-3.5" />{c.edit}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{form.id ? c.edit : c.create}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>{c.name}</Label><Input value={form.name} onChange={(e) => update('name', e.target.value)} required /></div>
              <div className="space-y-2"><Label>{c.type}</Label><select className="h-9 w-full rounded-md border bg-white px-3" value={form.planType} onChange={(e) => update('planType', e.target.value)}>{planTypes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
            </div>
            <div className="space-y-2"><Label>{c.description}</Label><textarea className="min-h-20 w-full rounded-md border bg-white p-3 text-sm" value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{c.assignedTrainer}</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-white px-3"
                    value={form.trainerId}
                    onChange={(event) => {
                      update('trainerId', event.target.value);
                      if (!event.target.value) update('trainerCommissionPercent', '0');
                    }}
                  >
                    <option value="">{c.noTrainer}</option>
                    {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{c.commissionPercent}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    disabled={!form.trainerId}
                    value={form.trainerCommissionPercent}
                    onChange={(event) => update('trainerCommissionPercent', event.target.value)}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">{c.gymShare}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2"><Label>{c.price}</Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} /></div>
              <div className="space-y-2"><Label>{c.currency}</Label><Input maxLength={3} value={form.currency} onChange={(e) => update('currency', e.target.value.toUpperCase())} /></div>
              <div className="space-y-2"><Label>{c.durationDays}</Label><Input type="number" min="1" value={form.durationDays} onChange={(e) => update('durationDays', e.target.value)} /></div>
              <div className="space-y-2"><Label>{c.maxMembers}</Label><Input type="number" min={form.planType === 'individual' ? 1 : 2} disabled={form.planType === 'individual'} value={form.maxMembers} onChange={(e) => update('maxMembers', e.target.value)} /></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>{c.startDate}</Label><DateInput value={form.validFrom} onChange={(value) => update('validFrom', value)} /></div>
              <div className="space-y-2"><Label>{c.endDate}</Label><DateInput value={form.validTo} onChange={(value) => update('validTo', value)} /></div>
            </div>
            <div className="rounded-lg border p-4 space-y-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.sessionsUnlimited} onChange={(e) => update('sessionsUnlimited', e.target.checked)} />{c.sessionsUnlimited}</label>
              {!form.sessionsUnlimited && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>{c.sessionsPerCycle}</Label><Input type="number" min="1" value={form.sessionsPerCycle} onChange={(e) => update('sessionsPerCycle', e.target.value)} /></div>
                    <div className="space-y-2"><Label>{c.cycleFrequency}</Label><select className="h-9 w-full rounded-md border px-3" value={form.cycleFrequency} onChange={(e) => update('cycleFrequency', e.target.value)}>{cycles.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
                  </div>
                  {form.planType !== 'individual' && (
                    <>
                      {form.distributionModel === 'custom' && (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2"><Label>{c.holderSessions}</Label><Input type="number" min="0" value={form.holderSessionsPerCycle} onChange={(e) => update('holderSessionsPerCycle', e.target.value)} /></div>
                          <div className="space-y-2"><Label>{c.beneficiarySessions}</Label><Input type="number" min="0" value={form.beneficiarySessionsPerCycle} onChange={(e) => update('beneficiarySessionsPerCycle', e.target.value)} /></div>
                        </div>
                      )}
                    </>
                  )}
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.carryoverEnabled} onChange={(e) => update('carryoverEnabled', e.target.checked)} />{c.carryover}</label>
                  {form.carryoverEnabled && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2"><Label>{c.carryoverMax}</Label><Input type="number" min="0" value={form.carryoverMax} onChange={(e) => update('carryoverMax', e.target.value)} /></div>
                      <div className="space-y-2"><Label>{c.carryoverExpiry}</Label><Input type="number" min="1" value={form.carryoverExpiryDays} onChange={(e) => update('carryoverExpiryDays', e.target.value)} /></div>
                    </div>
                  )}
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowExtraSessions} onChange={(e) => update('allowExtraSessions', e.target.checked)} />{c.extraSessions}</label>
                  {form.allowExtraSessions && <div className="space-y-2"><Label>{c.extraSessionPrice}</Label><Input type="number" min="0" step="0.01" value={form.extraSessionPrice} onChange={(e) => update('extraSessionPrice', e.target.value)} /></div>}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>{c.deductionMoment}</Label><select className="h-9 w-full rounded-md border px-3" value={form.deductionMoment} onChange={(e) => update('deductionMoment', e.target.value)}>{deductionMoments.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
                    <div className="space-y-2"><Label>{c.cancellationWindow}</Label><Input type="number" min="0" value={form.cancellationWindowMinutes} onChange={(e) => update('cancellationWindowMinutes', e.target.value)} /></div>
                    <div className="space-y-2"><Label>{c.lateCancellationThreshold}</Label><Input type="number" min="1" value={form.lateCancellationThreshold} onChange={(e) => update('lateCancellationThreshold', e.target.value)} /></div>
                    <div className="space-y-2"><Label>{c.lateCancellationPenalty}</Label><Input type="number" min="0" value={form.lateCancellationPenalty} onChange={(e) => update('lateCancellationPenalty', e.target.value)} /></div>
                  </div>
                  {([
                    ['autoRefundOnTime', c.autoRefund],
                    ['noShowConsumesSession', c.noShowConsumes],
                    ['reschedulingAllowed', c.rescheduling],
                    ['staffExceptionsAllowed', c.staffExceptions],
                    ['gymCancellationRefund', c.gymCancellationRefund],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />{label}</label>
                  ))}
                </>
              )}
              {form.planType !== 'individual' && (
                <>
                <div className="space-y-2"><Label>{c.distribution}</Label><select className="h-9 w-full rounded-md border px-3" value={form.distributionModel} onChange={(e) => update('distributionModel', e.target.value)}>{distributions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.sharedBenefits} onChange={(e) => update('sharedBenefits', e.target.checked)} />{c.sharedBenefits}</label>
                <div className="space-y-2"><Label>{c.bookingPolicy}</Label><select className="h-9 w-full rounded-md border px-3" value={form.futureBookingPolicy} onChange={(e) => update('futureBookingPolicy', e.target.value)}>{bookingPolicies.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
                </>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>{c.benefits}</Label><textarea className="min-h-24 w-full rounded-md border p-3 text-sm" value={form.benefits} onChange={(e) => update('benefits', e.target.value)} /></div>
              <div className="space-y-2"><Label>{c.restrictions}</Label><textarea className="min-h-24 w-full rounded-md border p-3 text-sm" value={form.restrictions} onChange={(e) => update('restrictions', e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>{c.status}</Label><select className="h-9 w-full rounded-md border px-3" value={form.status} onChange={(e) => update('status', e.target.value)}>{statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>{c.cancel}</Button><Button type="submit" disabled={saving}>{saving ? c.saving : c.save}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
