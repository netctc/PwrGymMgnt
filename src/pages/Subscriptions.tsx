import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CreditCard,
  Download,
  Layers,
  MinusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import DateInput from '../components/DateInput';
import { formatDate } from '../lib/formatDate';
import {
  subscriptionsV2Api,
  type SubscriptionV2,
} from '../lib/subscriptionsV2Api';
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

export default function Subscriptions() {
  const navigate = useNavigate();
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
        };

  const [view, setView] = useState<DirectoryView>('individual_unlimited');
  const [subscriptions, setSubscriptions] = useState<SubscriptionV2[]>([]);
  const [planOptions, setPlanOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [trainerOptions, setTrainerOptions] = useState<Array<{ id: string; name: string }>>([]);
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

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const response = await subscriptionsV2Api.listSubscriptions({
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
    const timeout = window.setTimeout(() => {
      void loadSubscriptions();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, memberStatus, subscriptionStatus, paymentStatus, planId, planType, trainerId, from, to, sessionType]);

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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-9">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Label htmlFor="subscription-search">{copy.search}</Label>
              <Search className="absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
              <Input id="subscription-search" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
            <div><Label>{copy.memberStatus}</Label><select className={selectClassName} value={memberStatus} onChange={(event) => setMemberStatus(event.target.value)}><option value="all">{copy.all}</option><option value="active">{copy.active}</option><option value="suspended">{copy.suspended}</option><option value="archived">{copy.archived}</option></select></div>
            <div><Label>{copy.subscriptionStatus}</Label><select className={selectClassName} value={subscriptionStatus} onChange={(event) => setSubscriptionStatus(event.target.value)}><option value="active">{copy.active}</option><option value="all">{copy.all}</option><option value="suspended">{copy.suspended}</option><option value="frozen">Frozen</option><option value="cancelled">{copy.cancelled}</option><option value="expired">{copy.expired}</option></select></div>
            <div><Label>{copy.paymentStatus}</Label><select className={selectClassName} value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="all">{copy.all}</option><option value="paid">{copy.paid}</option><option value="pending">{copy.pending}</option><option value="partial">Partial</option><option value="overdue">Overdue</option></select></div>
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
                  {visibleSubscriptions.map((subscription) => (
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
    </div>
  );
}
