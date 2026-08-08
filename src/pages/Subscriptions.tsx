import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CreditCard,
  CalendarClock,
  Download,
  Layers,
  MinusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Snowflake,
  Play,
  Ban,
  Users,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import DateInput from '../components/DateInput';
import ListPagination from '../components/ListPagination';
import { formatDate } from '../lib/formatDate';
import {
  subscriptionsV2Api,
  type SubscriptionV2,
  type PlanVersion,
} from '../lib/subscriptionsV2Api';
import { planManagementApi, type MaintenanceList } from '../lib/planManagementApi';
import { useLocalization } from '../contexts/LocalizationContext';

type DirectoryView = 'individual_unlimited' | 'individual_limited' | 'multi_user';
type SessionAction = 'deduct' | 'return';

type SubscriptionMemberOption = {
  memberId: string;
  affiliationId: string;
  name: string;
  role: string;
};

type SessionActionState = {
  subscription: SubscriptionV2;
  action: SessionAction;
  members: SubscriptionMemberOption[];
};

const selectClassName =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400';

function statusBadge(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active' || normalized === 'paid') return 'default';
  if (['pending', 'partial', 'overdue'].includes(normalized)) return 'destructive';
  return 'secondary';
}

function nextDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(start: string, end: string) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.round((endMs - startMs) / 86400000) + 1;
}

export default function Subscriptions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale } = useLocalization();
  const copy =
    locale === 'ar'
      ? {
          title: 'الاشتراكات',
          subtitle: 'عرض وإدارة جميع اشتراكات الأعضاء في النظام.',
          unlimited: 'اشتراكات فردية غير محدودة',
          limited: 'اشتراكات فردية محدودة الجلسات',
          multi: 'اشتراكات متعددة المستخدمين',
          search: 'البحث بالعضو أو الخطة أو رقم الاشتراك',
          memberStatus: 'حالة العضو',
          subscriptionStatus: 'حالة الاشتراك',
          paymentStatus: 'حالة الدفع',
          expectedPaymentDate: 'تاريخ الدفع المتوقع',
          plan: 'الخطة',
          planType: 'نوع الخطة',
          trainer: 'المدرب',
          from: 'من تاريخ',
          to: 'إلى تاريخ',
          sessionType: 'نوع الجلسات',
          all: 'الكل',
          active: 'نشط',
          suspended: 'معلق',
          archived: 'مؤرشف',
          cancelled: 'ملغي',
          expired: 'منتهي',
          paid: 'مدفوع',
          pending: 'دفع معلق',
          limitedSessions: 'جلسات محدودة',
          unlimitedSessions: 'جلسات غير محدودة',
          refresh: 'تحديث',
          member: 'العضو',
          holder: 'صاحب الاشتراك',
          dates: 'الفترة',
          contracted: 'المتعاقد عليها',
          consumed: 'المستهلكة',
          remaining: 'المتبقية',
          members: 'الأعضاء',
          sessions: 'الجلسات',
          actions: 'الإجراءات',
          deduct: 'خصم جلسة',
          return: 'إرجاع جلسة',
          sessionPdf: 'تقرير PDF',
          noRows: 'لا توجد اشتراكات مطابقة للفلاتر المحددة.',
          reason: 'السبب',
          reasonPlaceholder: 'أدخل سبب التعديل للتدقيق',
          quantity: 'الكمية',
          targetMember: 'العضو المستفيد',
          confirmDeduct: 'تأكيد خصم الجلسات',
          confirmReturn: 'إرجاع آخر جلسة مخصومة',
          close: 'إلغاء',
          newSubscription: 'اشتراك جديد',
          newMulti: 'اشتراك متعدد المستخدمين',
          currentCycle: 'الدورة الحالية',
          legacy: 'قديم',
          schedulePlan: 'جدولة الخطة التالية',
          nextPlan: 'الخطة التالية',
          effective: 'تاريخ التطبيق',
          confirmSchedule: 'جدولة التغيير',
          freeze: 'تجميد', resume: 'استئناف', freezeStart: 'بداية التجميد', freezeEnd: 'نهاية التجميد', resumeDate: 'تاريخ الاستئناف', confirmFreeze: 'تأكيد التجميد', confirmResume: 'تأكيد الاستئناف',
          cancelSubscription: 'إلغاء الاشتراك', cancellationDate: 'تاريخ سريان الإلغاء', confirmCancellation: 'تأكيد إلغاء الاشتراك', cancellationWarning: 'سيتم إلغاء جميع المستفيدين والحجوزات المستقبلية. ستبقى المدفوعات والجلسات السابقة محفوظة.',
        }
      : {
          title: 'Subscriptions',
          subtitle: 'View and manage every member subscription in the system.',
          unlimited: 'Individual unlimited',
          limited: 'Individual limited sessions',
          multi: 'Multi-user subscriptions',
          search: 'Search member, plan or subscription ID',
          memberStatus: 'Member status',
          subscriptionStatus: 'Subscription status',
          paymentStatus: 'Payment status',
          expectedPaymentDate: 'Estimated payment date',
          plan: 'Plan',
          planType: 'Plan type',
          trainer: 'Trainer',
          from: 'From',
          to: 'To',
          sessionType: 'Session type',
          all: 'All',
          active: 'Active',
          suspended: 'Suspended',
          archived: 'Archived',
          cancelled: 'Cancelled',
          expired: 'Expired',
          paid: 'Paid',
          pending: 'Payment pending',
          limitedSessions: 'Limited sessions',
          unlimitedSessions: 'Unlimited sessions',
          refresh: 'Refresh',
          member: 'Member',
          holder: 'Holder',
          dates: 'Validity',
          contracted: 'Contracted',
          consumed: 'Consumed',
          remaining: 'Remaining',
          members: 'Members',
          sessions: 'Sessions',
          actions: 'Actions',
          deduct: 'Deduct session',
          return: 'Return session',
          sessionPdf: 'Session PDF',
          noRows: 'No subscriptions match the selected filters.',
          reason: 'Reason',
          reasonPlaceholder: 'Enter an audit reason for this adjustment',
          quantity: 'Quantity',
          targetMember: 'Affiliated member',
          confirmDeduct: 'Confirm session deduction',
          confirmReturn: 'Return latest deducted session',
          close: 'Cancel',
          newSubscription: 'New Subscription',
          newMulti: 'New multi-user subscription',
          currentCycle: 'Current cycle',
          legacy: 'Legacy',
          schedulePlan: 'Schedule next plan',
          nextPlan: 'Next plan',
          effective: 'Effective date',
          confirmSchedule: 'Schedule change',
          freeze: 'Freeze', resume: 'Resume', freezeStart: 'Freeze start', freezeEnd: 'Freeze end', resumeDate: 'Resume date', confirmFreeze: 'Confirm freeze', confirmResume: 'Confirm resume',
          cancelSubscription: 'Cancel subscription', cancellationDate: 'Effective cancellation date', confirmCancellation: 'Confirm cancellation', cancellationWarning: 'All beneficiaries and future reservations will be cancelled. Payment and completed-session history will be preserved.',
        };

  const [view, setView] = useState<DirectoryView>('individual_unlimited');
  const [subscriptions, setSubscriptions] = useState<SubscriptionV2[]>([]);
  const [planOptions, setPlanOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [trainerOptions, setTrainerOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [maintenanceLists, setMaintenanceLists] = useState<MaintenanceList[]>([]);
  const [activePlanVersions, setActivePlanVersions] = useState<PlanVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [memberStatus, setMemberStatus] = useState('all');
  const [subscriptionStatus, setSubscriptionStatus] = useState('active');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [planId, setPlanId] = useState('all');
  const [planType, setPlanType] = useState('all');
  const [trainerId, setTrainerId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sessionType, setSessionType] = useState('all');
  const [actionState, setActionState] = useState<SessionActionState | null>(null);
  const [actionAffiliationId, setActionAffiliationId] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionQuantity, setActionQuantity] = useState('1');
  const [savingAction, setSavingAction] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [planChangeSubscription, setPlanChangeSubscription] = useState<SubscriptionV2 | null>(null);
  const [nextPlanVersionId, setNextPlanVersionId] = useState('');
  const [planChangeReason, setPlanChangeReason] = useState('');
  const [planChangePaymentStatus, setPlanChangePaymentStatus] = useState('pending');
  const [planChangeExpectedPaymentDate, setPlanChangeExpectedPaymentDate] = useState('');
  const [savingPlanChange, setSavingPlanChange] = useState(false);
  const [lifecycleSubscription, setLifecycleSubscription] = useState<SubscriptionV2 | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<'freeze' | 'resume'>('freeze');
  const today = new Date().toISOString().slice(0, 10);
  const [freezeStartDate, setFreezeStartDate] = useState(today);
  const [freezeEndDate, setFreezeEndDate] = useState(addDays(today, 6));
  const [freezeDays, setFreezeDays] = useState('7');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [cancellationSubscription, setCancellationSubscription] = useState<SubscriptionV2 | null>(null);
  const [cancellationDate, setCancellationDate] = useState(today);
  const [cancellationReason, setCancellationReason] = useState('');
  const [savingCancellation, setSavingCancellation] = useState(false);
  const requestedMemberId = searchParams.get('memberId') || '';
  const requestedSubscriptionId = searchParams.get('subscriptionId') || '';
  const requestedAction = searchParams.get('action') || '';

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const response = await subscriptionsV2Api.listSubscriptions({
        subscriptionId: requestedAction === 'change-plan' && requestedSubscriptionId
          ? requestedSubscriptionId
          : undefined,
        status: subscriptionStatus,
        memberStatus,
        paymentStatus,
        planId,
        planType,
        trainerId,
        from: from || undefined,
        to: to || undefined,
        sessions: sessionType,
        search: search.trim() || undefined,
      });
      setSubscriptions(response.subscriptions);
      setPlanOptions(response.filterOptions?.plans || []);
      setTrainerOptions(response.filterOptions?.trainers || []);
    } catch (error: any) {
      setSubscriptions([]);
      toast.error(error.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    planManagementApi.listMaintenance()
      .then((response) => setMaintenanceLists(response.lists))
      .catch(() => setMaintenanceLists([]));
  }, []);

  useEffect(() => {
    subscriptionsV2Api.listPlanVersions()
      .then((response) => setActivePlanVersions(response.planVersions.filter((plan) => plan.status === 'active')))
      .catch(() => setActivePlanVersions([]));
  }, []);

  const listOptions = (keys: string[], fallback: Array<{ value: string; label: string }>) => {
    const list = maintenanceLists.find((item) => keys.includes(item.key));
    const options = list?.items
      .filter((item) => item.status === 'active')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ value: item.code, label: locale === 'ar' ? item.labelAr : item.labelEn })) || [];
    return options.length > 0 ? options : fallback;
  };
  const memberStatusOptions = listOptions(['member_status', 'member_statuses'], [
    { value: 'active', label: copy.active },
    { value: 'suspended', label: copy.suspended },
    { value: 'archived', label: copy.archived },
  ]);
  const paymentStatusOptions = listOptions(['payment_status', 'payment_statuses'], [
    { value: 'paid', label: copy.paid },
    { value: 'pending', label: copy.pending },
    { value: 'partial', label: 'Partially paid' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'waived', label: 'Waived' },
    { value: 'refunded', label: 'Refunded' },
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadSubscriptions();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, memberStatus, subscriptionStatus, paymentStatus, planId, planType, trainerId, from, to, sessionType, requestedAction, requestedSubscriptionId]);

  useEffect(() => {
    if (requestedAction === 'change-plan' && requestedSubscriptionId) {
      setSearch(requestedSubscriptionId);
      setSubscriptionStatus('all');
      return;
    }
    if (!requestedMemberId) return;
    setSearch(requestedMemberId);
  }, [requestedAction, requestedMemberId, requestedSubscriptionId]);

  const categorized = useMemo(
    () => ({
      individual_unlimited: subscriptions.filter(
        (subscription) =>
          subscription.planType === 'individual' && subscription.sessionsUnlimited,
      ),
      individual_limited: subscriptions.filter(
        (subscription) =>
          subscription.planType === 'individual' && !subscription.sessionsUnlimited,
      ),
      multi_user: subscriptions.filter(
        (subscription) => subscription.planType !== 'individual',
      ),
    }),
    [subscriptions],
  );
  const visibleSubscriptions = categorized[view];
  const totalPages = Math.max(1, Math.ceil(visibleSubscriptions.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedSubscriptions = visibleSubscriptions.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [view, search, memberStatus, subscriptionStatus, paymentStatus, planId, planType, trainerId, from, to, sessionType, pageSize]);

  const openSessionAction = async (
    subscription: SubscriptionV2,
    action: SessionAction,
  ) => {
    if (subscription.source === 'legacy' || subscription.sessionsUnlimited) return;
    try {
      const response = await subscriptionsV2Api.listSubscriptionMembers(subscription.id);
      const members = response.members
        .filter((member) => member.affiliationId && member.status === 'active')
        .map((member) => ({
          memberId: member.memberId,
          affiliationId: member.affiliationId!,
          name:
            `${member.firstName || ''} ${member.lastName || ''}`.trim() ||
            member.email ||
            member.memberId,
          role: member.role,
        }));
      if (!members.length && subscription.holderAffiliationId) {
        members.push({
          memberId: subscription.holderMemberId,
          affiliationId: subscription.holderAffiliationId,
          name: subscription.holderName || subscription.holderMemberId,
          role: 'holder',
        });
      }
      if (!members.length) {
        toast.error('No active affiliation was found for this subscription');
        return;
      }
      setActionState({ subscription, action, members });
      setActionAffiliationId(members[0].affiliationId);
      setActionReason('');
      setActionQuantity('1');
    } catch (error: any) {
      toast.error(error.message || 'Failed to load subscription members');
    }
  };

  const submitSessionAction = async () => {
    if (!actionState || !actionAffiliationId || !actionReason.trim()) {
      toast.error(copy.reason);
      return;
    }
    setSavingAction(true);
    try {
      const idempotencyKey = `subscription_directory_${actionState.action}_${crypto.randomUUID()}`;
      const response =
        actionState.action === 'deduct'
          ? await subscriptionsV2Api.adjustSessions({
              affiliationId: actionAffiliationId,
              direction: 'negative',
              quantity: Math.max(1, Number(actionQuantity) || 1),
              reason: actionReason.trim(),
              idempotencyKey,
            })
          : await subscriptionsV2Api.returnLatestSession({
              affiliationId: actionAffiliationId,
              reason: actionReason.trim(),
              idempotencyKey,
            });
      toast.success(`${copy.remaining}: ${response.movement.balanceAfter}`);
      setActionState(null);
      await loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || 'Session adjustment failed');
    } finally {
      setSavingAction(false);
    }
  };

  const downloadSessionHistory = async (subscription: SubscriptionV2) => {
    try {
      await subscriptionsV2Api.downloadSessionHistoryPdf(subscription.id);
      toast.success(copy.sessionPdf);
    } catch (error: any) {
      toast.error(error.message || 'Unable to download session history');
    }
  };

  const openPlanChange = (subscription: SubscriptionV2) => {
    if (subscription.source === 'legacy' || subscription.status !== 'active') return;
    const firstAlternative = activePlanVersions.find((plan) => plan.id !== subscription.planVersionId);
    setPlanChangeSubscription(subscription);
    setNextPlanVersionId(subscription.scheduledPlanVersionId || firstAlternative?.id || '');
    setPlanChangeReason('');
    const effectiveDate = subscription.scheduledPlanEffectiveDate || nextDay(subscription.endDate);
    const scheduledStatus = subscription.scheduledPaymentStatus || 'pending';
    setPlanChangePaymentStatus(scheduledStatus);
    setPlanChangeExpectedPaymentDate(
      ['pending', 'partial'].includes(scheduledStatus)
        ? subscription.scheduledExpectedPaymentDate || effectiveDate
        : '',
    );
  };

  useEffect(() => {
    if (loading || requestedAction !== 'change-plan' || subscriptions.length === 0) return;
    const target = requestedSubscriptionId
      ? subscriptions.find((subscription) => subscription.id === requestedSubscriptionId)
      : subscriptions.find((subscription) => subscription.holderMemberId === requestedMemberId);
    if (!target) return;
    if (target.source === 'legacy') {
      toast.error('Change plan is available only for V2 subscriptions');
    } else if (target.status !== 'active') {
      toast.error(`Change plan is unavailable while the subscription is ${target.status}`);
    } else {
      openPlanChange(target);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    next.delete('subscriptionId');
    setSearchParams(next, { replace: true });
  }, [loading, requestedAction, requestedMemberId, requestedSubscriptionId, subscriptions]);

  const submitPlanChange = async () => {
    if (!planChangeSubscription || !nextPlanVersionId || !planChangeReason.trim()) return;
    const effectiveDate = planChangeSubscription.scheduledPlanEffectiveDate || nextDay(planChangeSubscription.endDate);
    if (['pending', 'partial'].includes(planChangePaymentStatus) && !planChangeExpectedPaymentDate) {
      toast.error('Estimated payment date is required for pending or partially paid reservations');
      return;
    }
    if (['pending', 'partial'].includes(planChangePaymentStatus) && planChangeExpectedPaymentDate < effectiveDate) {
      toast.error('Estimated payment date cannot be before the new plan start date');
      return;
    }
    setSavingPlanChange(true);
    try {
      const result = await subscriptionsV2Api.changePlan(planChangeSubscription.id, {
        planVersionId: nextPlanVersionId,
        reason: planChangeReason.trim(),
        paymentStatus: planChangePaymentStatus,
        expectedPaymentDate: ['pending', 'partial'].includes(planChangePaymentStatus)
          ? planChangeExpectedPaymentDate
          : undefined,
      });
      toast.success(`${copy.schedulePlan}: ${formatDate(result.effectiveDate)}`);
      setPlanChangeSubscription(null);
      await loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || 'Unable to schedule the plan change');
    } finally {
      setSavingPlanChange(false);
    }
  };

  const openLifecycle = (subscription: SubscriptionV2, action: 'freeze' | 'resume') => {
    setLifecycleSubscription(subscription);
    setLifecycleAction(action);
    setFreezeStartDate(today);
    setFreezeEndDate(action === 'freeze' ? addDays(today, 6) : today);
    setFreezeDays('7');
    setLifecycleReason('');
  };

  const submitLifecycle = async () => {
    if (!lifecycleSubscription || !lifecycleReason.trim()) return;
    setSavingLifecycle(true);
    try {
      if (lifecycleAction === 'freeze') {
        const requestedDays = Math.max(1, Math.trunc(Number(freezeDays) || 0));
        const expectedEndDate = addDays(freezeStartDate, requestedDays - 1);
        const result = await subscriptionsV2Api.freezeSubscription(lifecycleSubscription.id, { startDate: freezeStartDate, endDate: expectedEndDate, reason: lifecycleReason.trim() });
        if (result.plannedDays !== requestedDays) {
          throw new Error(`Freeze duration mismatch: requested ${requestedDays} day(s), server confirmed ${result.plannedDays}`);
        }
        toast.success(`${copy.freeze}: ${result.plannedDays} day(s)`);
      } else {
        const result = await subscriptionsV2Api.resumeSubscription(lifecycleSubscription.id, { resumeDate: freezeEndDate, reason: lifecycleReason.trim() });
        toast.success(`${copy.resume}: +${result.extensionDays} day(s)`);
      }
      setLifecycleSubscription(null);
      await loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || 'Subscription lifecycle update failed');
    } finally {
      setSavingLifecycle(false);
    }
  };

  const openCancellation = (subscription: SubscriptionV2) => {
    if (subscription.source === 'legacy' || !['active', 'frozen', 'suspended', 'pending'].includes(subscription.status)) return;
    setCancellationSubscription(subscription);
    setCancellationDate(today);
    setCancellationReason('');
  };

  const submitCancellation = async () => {
    if (!cancellationSubscription || !cancellationDate || !cancellationReason.trim()) return;
    setSavingCancellation(true);
    try {
      const result = await subscriptionsV2Api.cancelSubscription(cancellationSubscription.id, {
        effectiveDate: cancellationDate,
        reason: cancellationReason.trim(),
      });
      const summary = result.status === 'scheduled'
        ? `${copy.cancelSubscription}: ${formatDate(result.effectiveDate)}`
        : `${copy.cancelSubscription}: ${result.affectedMembers || 0} member(s), ${result.cancelledBookings || 0} booking(s)`;
      toast.success(summary);
      if (result.refundReview?.required) toast.info('Refund review required. No automatic refund was created.');
      setCancellationSubscription(null);
      await loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || 'Unable to cancel the subscription');
    } finally {
      setSavingCancellation(false);
    }
  };

  const renderCommonCells = (subscription: SubscriptionV2) => (
    <>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">
          {subscription.holderName || subscription.holderMemberId}
        </p>
        <p className="text-xs text-slate-500">{subscription.holderEmail}</p>
        <Badge variant="outline" className="mt-1">
          {subscription.holderStatus || '—'}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{subscription.planName}</p>
        <p className="text-xs text-slate-500">{subscription.id}</p>
        {subscription.source === 'legacy' && (
          <Badge variant="outline" className="mt-1">{copy.legacy}</Badge>
        )}
        {subscription.scheduledPlanName && (
          <div className="mt-1 text-xs font-medium text-indigo-600">
            <p>{copy.nextPlan}: {subscription.scheduledPlanName} · {formatDate(subscription.scheduledPlanEffectiveDate || '')}</p>
            <p>{copy.paymentStatus}: {subscription.scheduledPaymentStatus || 'pending'}{subscription.scheduledExpectedPaymentDate ? ` · ${copy.expectedPaymentDate}: ${formatDate(subscription.scheduledExpectedPaymentDate)}` : ''}</p>
          </div>
        )}
        {subscription.source !== 'legacy' && subscription.status === 'active' && (
          <div className="mt-1 flex flex-wrap gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openPlanChange(subscription)}><CalendarClock className="mr-1 h-3.5 w-3.5" />{copy.schedulePlan}</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openLifecycle(subscription, 'freeze')}><Snowflake className="mr-1 h-3.5 w-3.5" />{copy.freeze}</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-600" onClick={() => openCancellation(subscription)}><Ban className="mr-1 h-3.5 w-3.5" />{copy.cancelSubscription}</Button></div>
        )}
        {subscription.source !== 'legacy' && subscription.status === 'frozen' && <div className="mt-1 flex flex-wrap gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openLifecycle(subscription, 'resume')}><Play className="mr-1 h-3.5 w-3.5" />{copy.resume}</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-600" onClick={() => openCancellation(subscription)}><Ban className="mr-1 h-3.5 w-3.5" />{copy.cancelSubscription}</Button></div>}
      </td>
      {view === 'individual_limited' && (
        <td className="px-4 py-3 text-sm text-slate-700">
          {subscription.trainerName || 'N/A'}
        </td>
      )}
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
        <p>{formatDate(subscription.startDate)}</p>
        <p>{formatDate(subscription.endDate)}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant={statusBadge(subscription.paymentStatus) as any}>
          {subscription.paymentStatus}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={statusBadge(subscription.status) as any}>
          {subscription.status}
        </Badge>
      </td>
    </>
  );

  return (
    <div className="space-y-5 p-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/members?newSubscription=1')}>
            {copy.newSubscription}
          </Button>
          <Button onClick={() => navigate('/subscriptions/new-hybrid')}>
            {copy.newMulti}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-slate-500">{copy.unlimited}</p><p className="text-2xl font-bold">{categorized.individual_unlimited.length}</p></div>
            <CreditCard className="h-8 w-8 text-indigo-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-slate-500">{copy.limited}</p><p className="text-2xl font-bold">{categorized.individual_limited.length}</p></div>
            <Layers className="h-8 w-8 text-amber-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-slate-500">{copy.multi}</p><p className="text-2xl font-bold">{categorized.multi_user.length}</p></div>
            <Users className="h-8 w-8 text-emerald-500" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative md:col-span-2">
              <Label htmlFor="subscription-search">{copy.search}</Label>
              <Search className="absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
              <Input id="subscription-search" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
            <div><Label>{copy.memberStatus}</Label><select className={selectClassName} value={memberStatus} onChange={(event) => setMemberStatus(event.target.value)}><option value="all">{copy.all}</option>{memberStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
            <div><Label>{copy.subscriptionStatus}</Label><select className={selectClassName} value={subscriptionStatus} onChange={(event) => setSubscriptionStatus(event.target.value)}><option value="active">{copy.active}</option><option value="all">{copy.all}</option><option value="suspended">{copy.suspended}</option><option value="frozen">Frozen</option><option value="cancelled">{copy.cancelled}</option><option value="expired">{copy.expired}</option></select></div>
            <div><Label>{copy.paymentStatus}</Label><select className={selectClassName} value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="all">{copy.all}</option>{paymentStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
            <div><Label>{copy.plan}</Label><select className={selectClassName} value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="all">{copy.all}</option>{planOptions.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
            <div><Label>{copy.planType}</Label><select className={selectClassName} value={planType} onChange={(event) => setPlanType(event.target.value)}><option value="all">{copy.all}</option><option value="individual">Individual</option><option value="family">Family</option><option value="group">Group</option><option value="corporate">Corporate</option></select></div>
            <div><Label>{copy.trainer}</Label><select className={selectClassName} value={trainerId} onChange={(event) => setTrainerId(event.target.value)}><option value="all">{copy.all}</option>{trainerOptions.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}</select></div>
            <div><Label>{copy.from}</Label><DateInput value={from} onChange={setFrom} /></div>
            <div><Label>{copy.to}</Label><DateInput value={to} onChange={setTo} /></div>
            <div><Label>{copy.sessionType}</Label><div className="flex gap-2"><select className={selectClassName} value={sessionType} onChange={(event) => setSessionType(event.target.value)}><option value="all">{copy.all}</option><option value="limited">{copy.limitedSessions}</option><option value="unlimited">{copy.unlimitedSessions}</option></select><Button variant="outline" size="icon" onClick={() => void loadSubscriptions()} title={copy.refresh}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button></div></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-2">
        {([
          ['individual_unlimited', copy.unlimited],
          ['individual_limited', copy.limited],
          ['multi_user', copy.multi],
        ] as Array<[DirectoryView, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${view === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label} ({categorized[id].length})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{view === 'individual_unlimited' ? copy.unlimited : view === 'individual_limited' ? copy.limited : copy.multi}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading...</div>
          ) : visibleSubscriptions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">{copy.noRows}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-y bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">{view === 'multi_user' ? copy.holder : copy.member}</th>
                    <th className="px-4 py-3">{copy.plan}</th>
                    {view === 'individual_limited' && <th className="px-4 py-3">{copy.trainer}</th>}
                    <th className="px-4 py-3">{copy.dates}</th>
                    <th className="px-4 py-3">{copy.paymentStatus}</th>
                    <th className="px-4 py-3">{copy.subscriptionStatus}</th>
                    {view === 'individual_limited' && <><th className="px-4 py-3 text-center">{copy.contracted}</th><th className="px-4 py-3 text-center">{copy.consumed}</th><th className="px-4 py-3 text-center">{copy.remaining}</th><th className="px-4 py-3 text-right">{copy.actions}</th></>}
                    {view === 'multi_user' && <><th className="px-4 py-3 text-center">{copy.members}</th><th className="px-4 py-3 text-center">{copy.contracted}</th><th className="px-4 py-3 text-center">{copy.consumed}</th><th className="px-4 py-3 text-center">{copy.remaining}</th><th className="px-4 py-3 text-right">{copy.actions}</th></>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pagedSubscriptions.map((subscription) => (
                    <tr key={`${subscription.source}-${subscription.id}`} className="hover:bg-slate-50">
                      {renderCommonCells(subscription)}
                      {view === 'individual_limited' && (
                        <>
                          <td className="px-4 py-3 text-center font-semibold">{subscription.sessionsContracted ?? subscription.sessionsPerCycle ?? 0}</td>
                          <td className="px-4 py-3 text-center font-semibold text-rose-600">{subscription.sessionsConsumed ?? 0}</td>
                          <td className="px-4 py-3 text-center font-semibold text-emerald-600">{subscription.sessionsRemaining ?? 0}</td>
                          <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => void openSessionAction(subscription, 'deduct')}><MinusCircle className="mr-1 h-4 w-4" />{copy.deduct}</Button><Button size="sm" variant="outline" onClick={() => void openSessionAction(subscription, 'return')}><RotateCcw className="mr-1 h-4 w-4" />{copy.return}</Button><Button size="sm" variant="outline" onClick={() => void downloadSessionHistory(subscription)}><Download className="mr-1 h-4 w-4" />{copy.sessionPdf}</Button></div></td>
                        </>
                      )}
                      {view === 'multi_user' && (
                        <>
                          <td className="px-4 py-3 text-center">{subscription.activeMembers || 1}/{subscription.maxMembers}</td>
                          <td className="px-4 py-3 text-center font-semibold">{subscription.sessionsUnlimited ? '∞' : subscription.sessionsContracted ?? subscription.sessionsPerCycle ?? 0}</td>
                          <td className="px-4 py-3 text-center font-semibold text-rose-600">{subscription.sessionsUnlimited ? '—' : subscription.sessionsConsumed ?? 0}</td>
                          <td className="px-4 py-3 text-center font-semibold text-emerald-600">{subscription.sessionsUnlimited ? '∞' : subscription.sessionsRemaining ?? 0}</td>
                          <td className="px-4 py-3"><div className="flex justify-end gap-2">{!subscription.sessionsUnlimited && <><Button size="sm" variant="outline" onClick={() => void openSessionAction(subscription, 'deduct')}>{copy.deduct}</Button><Button size="sm" variant="outline" onClick={() => void openSessionAction(subscription, 'return')}>{copy.return}</Button><Button size="sm" variant="outline" onClick={() => void downloadSessionHistory(subscription)}><Download className="mr-1 h-4 w-4" />{copy.sessionPdf}</Button></>}</div></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && visibleSubscriptions.length > 0 && (
            <ListPagination
              page={safePage}
              pageSize={pageSize}
              total={visibleSubscriptions.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              locale={locale}
            />
          )}
        </CardContent>
      </Card>

      {actionState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setActionState(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">{actionState.action === 'deduct' ? copy.deduct : copy.return}</h2>
            <p className="mt-1 text-sm text-slate-500">{actionState.subscription.holderName} · {actionState.subscription.planName}</p>
            <div className="mt-5 space-y-4">
              <div><Label>{copy.targetMember}</Label><select className={selectClassName} value={actionAffiliationId} onChange={(event) => setActionAffiliationId(event.target.value)}>{actionState.members.map((member) => <option key={member.affiliationId} value={member.affiliationId}>{member.name} — {member.role}</option>)}</select></div>
              {actionState.action === 'deduct' && <div><Label>{copy.quantity}</Label><Input type="number" min="1" value={actionQuantity} onChange={(event) => setActionQuantity(event.target.value)} /></div>}
              <div><Label>{copy.reason}</Label><Input value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder={copy.reasonPlaceholder} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionState(null)}>{copy.close}</Button>
              <Button onClick={() => void submitSessionAction()} disabled={savingAction || !actionReason.trim()}>
                {actionState.action === 'deduct' ? copy.confirmDeduct : copy.confirmReturn}
              </Button>
            </div>
          </div>
        </div>
      )}

      {planChangeSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setPlanChangeSubscription(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">{copy.schedulePlan}</h2>
            <p className="mt-1 text-sm text-slate-500">{planChangeSubscription.holderName} · {planChangeSubscription.planName}</p>
            <div className="mt-5 space-y-4">
              <div><Label>{copy.nextPlan}</Label><select className={selectClassName} value={nextPlanVersionId} onChange={(event) => setNextPlanVersionId(event.target.value)}><option value="">—</option>{activePlanVersions.filter((plan) => plan.id !== planChangeSubscription.planVersionId).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.price} {plan.currency}</option>)}</select></div>
              <div><Label>{copy.effective}</Label><Input value={formatDate(planChangeSubscription.scheduledPlanEffectiveDate || nextDay(planChangeSubscription.endDate))} disabled /></div>
              <div><Label>{copy.paymentStatus}</Label><select className={selectClassName} value={planChangePaymentStatus} onChange={(event) => { const status = event.target.value; setPlanChangePaymentStatus(status); setPlanChangeExpectedPaymentDate(['pending', 'partial'].includes(status) ? planChangeSubscription.scheduledPlanEffectiveDate || nextDay(planChangeSubscription.endDate) : ''); }}>{paymentStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
              {['pending', 'partial'].includes(planChangePaymentStatus) && <div><Label>{copy.expectedPaymentDate}</Label><DateInput value={planChangeExpectedPaymentDate} onChange={setPlanChangeExpectedPaymentDate} min={planChangeSubscription.scheduledPlanEffectiveDate || nextDay(planChangeSubscription.endDate)} /></div>}
              <div><Label>{copy.reason}</Label><Input value={planChangeReason} onChange={(event) => setPlanChangeReason(event.target.value)} placeholder={copy.reasonPlaceholder} /></div>
              <p className="text-xs text-slate-500">The current plan, price, benefits and sessions remain unchanged until renewal.</p>
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setPlanChangeSubscription(null)}>{copy.close}</Button><Button onClick={() => void submitPlanChange()} disabled={savingPlanChange || !nextPlanVersionId || !planChangeReason.trim()}>{copy.confirmSchedule}</Button></div>
          </div>
        </div>
      )}

      {lifecycleSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setLifecycleSubscription(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">{lifecycleAction === 'freeze' ? copy.freeze : copy.resume}</h2>
            <p className="mt-1 text-sm text-slate-500">{lifecycleSubscription.holderName} · {lifecycleSubscription.planName}</p>
            <div className="mt-5 space-y-4">
              {lifecycleAction === 'freeze' && <div><Label>{copy.freezeStart}</Label><DateInput value={freezeStartDate} onChange={(value) => { setFreezeStartDate(value); setFreezeEndDate(addDays(value, Math.max(1, Number(freezeDays) || 1) - 1)); }} /></div>}
              {lifecycleAction === 'freeze' && <div><Label>Freeze duration (days)</Label><Input type="number" min="1" max="30" step="1" value={freezeDays} onChange={(event) => { const value = event.target.value; setFreezeDays(value); const days = Math.max(1, Math.trunc(Number(value) || 1)); setFreezeEndDate(addDays(freezeStartDate, days - 1)); }} /></div>}
              <div><Label>{lifecycleAction === 'freeze' ? copy.freezeEnd : copy.resumeDate}</Label><DateInput value={freezeEndDate} onChange={(value) => { setFreezeEndDate(value); if (lifecycleAction === 'freeze') setFreezeDays(String(inclusiveDays(freezeStartDate, value))); }} /></div>
              <div><Label>{copy.reason}</Label><Input value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} placeholder={copy.reasonPlaceholder} /></div>
              <p className="text-xs text-slate-500">Access is blocked while frozen. On resume, the contract end date is extended only when the selected plan version allows it.</p>
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setLifecycleSubscription(null)}>{copy.close}</Button><Button onClick={() => void submitLifecycle()} disabled={savingLifecycle || !lifecycleReason.trim() || !freezeEndDate}>{lifecycleAction === 'freeze' ? copy.confirmFreeze : copy.confirmResume}</Button></div>
          </div>
        </div>
      )}

      {cancellationSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setCancellationSubscription(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-rose-700">{copy.cancelSubscription}</h2>
            <p className="mt-1 text-sm text-slate-500">{cancellationSubscription.holderName} · {cancellationSubscription.planName}</p>
            <div className="mt-5 space-y-4">
              <div><Label>{copy.cancellationDate}</Label><DateInput value={cancellationDate} onChange={setCancellationDate} min={today} /></div>
              <div><Label>{copy.reason}</Label><Input value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder={copy.reasonPlaceholder} /></div>
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{copy.cancellationWarning}</p>
              <p className="text-xs text-slate-500">Refund eligibility is recorded for manual review. This action never creates an automatic refund.</p>
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setCancellationSubscription(null)}>{copy.close}</Button><Button variant="destructive" onClick={() => void submitCancellation()} disabled={savingCancellation || !cancellationDate || !cancellationReason.trim()}>{copy.confirmCancellation}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
