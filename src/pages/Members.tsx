import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import DateInput from '../components/DateInput';
import { Label } from '../components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import ConfirmActionDialog from '../components/ConfirmActionDialog';
import EmptyState from '../components/EmptyState';
import InlineAlert from '../components/InlineAlert';
import ScreenReportActions from '../components/ScreenReportActions';
import {
  membershipApi,
  type MembershipInvoice,
  type MembershipMember,
  type MembershipPlan,
  type MembershipSubscription,
} from '../lib/membershipApi';
import {
  Archive,
  CreditCard,
  Download,
  Eye,
  IdCard,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePersistentState } from '../hooks/usePersistentState';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  subscriptionsV2Api,
  type SubscriptionV2,
} from '../lib/subscriptionsV2Api';
import {
  planManagementApi,
  type ManagedPlan,
} from '../lib/planManagementApi';

type MemberForm = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  joinDate: string;
};

type MemberDetail = {
  member: MembershipMember;
  subscriptions: MembershipSubscription[];
  invoices: MembershipInvoice[];
};

const MEMBER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
  { value: 'archived', label: 'Archived' },
];

const today = () => new Date().toISOString().slice(0, 10);

const emptyMemberForm: MemberForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  status: 'inactive',
  joinDate: today(),
};

function toMemberForm(member?: MembershipMember): MemberForm {
  if (!member) return emptyMemberForm;
  return {
    id: member.id,
    firstName: member.firstName || '',
    lastName: member.lastName || '',
    email: member.email || '',
    phone: member.phone || '',
    status: member.status || 'inactive',
    joinDate: member.joinDate ? String(member.joinDate).slice(0, 10) : today(),
  };
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function addDaysToDate(date: string, days: number) {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getLatestSubscriptionEndDate(subscriptions: MembershipSubscription[]) {
  const active = subscriptions
    .filter((subscription) => subscription.status === 'active' && subscription.endDate)
    .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
  return active[0]?.endDate ? String(active[0].endDate).slice(0, 10) : '';
}

function getLatestInvoice(invoices: MembershipInvoice[]) {
  return [...invoices].sort((a, b) => String(b.createdAt || b.dueDate || '').localeCompare(String(a.createdAt || a.dueDate || '')))[0] || null;
}

function dateValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function paymentStatusFromInvoice(invoice?: MembershipInvoice | null) {
  return String(invoice?.status || '').toLowerCase() === 'paid'
    ? 'paid'
    : 'pending';
}

function paymentDateFromInvoice(invoice?: MembershipInvoice | null) {
  return paymentStatusFromInvoice(invoice) === 'paid'
    ? dateValue(invoice?.paidAt) || today()
    : dateValue(invoice?.dueDate);
}

function getEffectiveMemberStatus(member: MembershipMember) {
  const status = String(member.status || '').toLowerCase();
  const expiry = member.currentExpiry ? String(member.currentExpiry).slice(0, 10) : '';
  if (status === 'active' && expiry && expiry < today()) return 'expired';
  return status || 'inactive';
}

function computeRenewalStartDate(currentExpiry?: string | null) {
  const todayValue = today();
  const expiry = currentExpiry ? String(currentExpiry).slice(0, 10) : '';
  return expiry && expiry >= todayValue ? addDaysToDate(expiry, 1) : todayValue;
}

function normalizeWhatsAppPhone(phone?: string) {
  return String(phone || '').replace(/\D/g, '');
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

function reducedDescription(value?: string | null) {
  const description = String(value || '').trim();
  if (description.length <= 180) return description;
  return `${description.slice(0, 177).trimEnd()}…`;
}

function badgeVariant(status?: string) {
  if (status === 'active' || status === 'paid') return 'default';
  if (status === 'archived' || status === 'expired') return 'destructive';
  return 'secondary';
}

export default function Members() {
  const { locale } = useLocalization();
  const [pageSearchParams, setPageSearchParams] = useSearchParams();
  const multiUserCopy = locale === 'ar'
    ? {
        create: 'اشتراك جديد متعدد المستخدمين',
        manage: 'إدارة المستفيدين',
        paid: 'مدفوع',
        pending: 'الدفع معلّق',
        otherMembers: 'الأعضاء الآخرون',
        capacity: 'السعة',
        available: 'المتاح',
        currentPlanFilter: 'الخطة الحالية',
        paymentStatusFilter: 'حالة الدفع',
        expiryDateFilter: 'تاريخ الانتهاء',
        sortBy: 'الترتيب حسب',
        membersPerPage: 'عدد الأعضاء في الصفحة',
        allCurrentPlans: 'جميع الخطط الحالية',
        allPaymentStatuses: 'جميع حالات الدفع',
        expiryAsc: 'الانتهاء تصاعدياً',
        expiryDesc: 'الانتهاء تنازلياً',
        joinedAsc: 'الانضمام تصاعدياً',
        joinedDesc: 'الانضمام تنازلياً',
        lastAccessAsc: 'آخر دخول تصاعدياً',
        lastAccessDesc: 'آخر دخول تنازلياً',
        previous: 'السابق',
        next: 'التالي',
        showing: 'عرض',
        of: 'من',
        members: 'أعضاء',
        apply: 'تطبيق',
        clear: 'مسح',
        newSubscriptions: 'اشتراك جديد',
        searchExistingMember: 'البحث عن عضو موجود',
        selectExistingMember: 'اختر عضواً موجوداً',
        consumed: 'المستهلك',
        remaining: 'المتبقي',
        reserved: 'المحجوز',
        setPrimary: 'تعيين كخطة رئيسية',
        primaryUpdated: 'تم تحديث الخطة الرئيسية',
      }
    : {
        create: 'New multi-user subscription',
        manage: 'Manage beneficiaries',
        paid: 'Paid',
        pending: 'Payment pending',
        otherMembers: 'Other members',
        capacity: 'Capacity',
        available: 'Available',
        currentPlanFilter: 'Current Plan',
        paymentStatusFilter: 'Payment Status',
        expiryDateFilter: 'Expiry Date',
        sortBy: 'Sort by',
        membersPerPage: 'Members per page',
        allCurrentPlans: 'All current plans',
        allPaymentStatuses: 'All payment statuses',
        expiryAsc: 'Expiry Asc',
        expiryDesc: 'Expiry Desc',
        joinedAsc: 'Joined Asc',
        joinedDesc: 'Joined Desc',
        lastAccessAsc: 'Last Access Asc',
        lastAccessDesc: 'Last Access Desc',
        previous: 'Previous',
        next: 'Next',
        showing: 'Showing',
        of: 'of',
        members: 'members',
        apply: 'Apply',
        clear: 'Clear',
        newSubscriptions: 'New Subscriptions',
        searchExistingMember: 'Search existing member',
        selectExistingMember: 'Select an existing member',
        consumed: 'Consumed',
        remaining: 'Remaining',
        reserved: 'Reserved',
        setPrimary: 'Set as primary',
        primaryUpdated: 'Primary plan updated',
      };
  const [members, setMembers] = useState<MembershipMember[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [newSubscriptionPlans, setNewSubscriptionPlans] =
    useState<ManagedPlan[]>([]);
  const [search, setSearch] = usePersistentState('powergym.members.search', '');
  const [statusFilter, setStatusFilter] = usePersistentState('powergym.members.statusFilter', '');
  const [accessFilter, setAccessFilter] = usePersistentState('powergym.members.accessFilter', '');
  const [accessDate, setAccessDate] = usePersistentState('powergym.members.accessDate', today());
  const [currentPlanFilter, setCurrentPlanFilter] = usePersistentState(
    'powergym.members.currentPlanFilter',
    '',
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = usePersistentState(
    'powergym.members.paymentStatusFilter',
    '',
  );
  const [expiryDateFilter, setExpiryDateFilter] = usePersistentState(
    'powergym.members.expiryDateFilter',
    '',
  );
  const [sortBy, setSortBy] = usePersistentState(
    'powergym.members.sortBy',
    'joined_desc',
  );
  const [membersPerPage, setMembersPerPage] = usePersistentState(
    'powergym.members.pageSize',
    25,
  );
  const [memberPage, setMemberPage] = useState(1);
  const [memberPagination, setMemberPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [memberSummary, setMemberSummary] = useState({
    total: 0,
    active: 0,
    archived: 0,
  });
  const [currentPlanOptions, setCurrentPlanOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMemberForm);
  const [editMember, setEditMember] = useState<MembershipMember | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [subscriptionIntent, setSubscriptionIntent] = useState<'renew' | 'new'>('renew');
  const [newSubscriptionMemberSearch, setNewSubscriptionMemberSearch] = useState('');
  const [newSubscriptionMemberOptions, setNewSubscriptionMemberOptions] =
    useState<MembershipMember[]>([]);
  const [newSubscriptionPlanVersionId, setNewSubscriptionPlanVersionId] =
    useState('');
  const [newSubscriptionSearching, setNewSubscriptionSearching] = useState(false);
  const [
    newSubscriptionRequiresMemberSelection,
    setNewSubscriptionRequiresMemberSelection,
  ] = useState(true);
  const [renewMember, setRenewMember] = useState<MembershipMember | null>(null);
  const [renewPlanId, setRenewPlanId] = useState('');
  const [renewStartDate, setRenewStartDate] = useState(today());
  const [renewCurrentExpiry, setRenewCurrentExpiry] = useState('');
  const [renewCurrentPlan, setRenewCurrentPlan] = useState('');
  const [renewPaymentStatus, setRenewPaymentStatus] = useState<
    '' | 'paid' | 'pending'
  >('');
  const [renewPaymentDate, setRenewPaymentDate] = useState('');
  const [renewMode, setRenewMode] = useState<'create' | 'edit'>('create');
  const [renewExistingLegacySubscriptionId, setRenewExistingLegacySubscriptionId] =
    useState<string | null>(null);
  const [renewExistingEndDate, setRenewExistingEndDate] = useState('');
  const [renewPaymentLocked, setRenewPaymentLocked] = useState(false);
  const [renewMultiSubscription, setRenewMultiSubscription] =
    useState<SubscriptionV2 | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrMember, setQrMember] = useState<MembershipMember | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [qrTokenId, setQrTokenId] = useState('');
  const [qrExpiryDate, setQrExpiryDate] = useState('');
  const [qrPlanName, setQrPlanName] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<MembershipMember | null>(null);
  const [expandedPlanKey, setExpandedPlanKey] = useState<string | null>(null);
  const [expandedGroupMemberId, setExpandedGroupMemberId] = useState<string | null>(null);
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const newMultiUserUrl = (memberId?: string) =>
    `/subscriptions/new-hybrid${memberId ? `?holderMemberId=${encodeURIComponent(memberId)}` : ''}`;
  const manageBeneficiariesUrl = (memberId: string) =>
    `/plans/multi-user?memberId=${encodeURIComponent(memberId)}`;

  const paginationPages = useMemo(() => {
    const candidates = [
      1,
      memberPagination.page - 1,
      memberPagination.page,
      memberPagination.page + 1,
      memberPagination.totalPages,
    ];
    return Array.from(
      new Set(
        candidates.filter(
          (page) => page >= 1 && page <= memberPagination.totalPages,
        ),
      ),
    ).sort((a, b) => a - b);
  }, [memberPagination.page, memberPagination.totalPages]);
  const selectedRenewPlan = useMemo(() => plans.find((plan) => plan.id === renewPlanId) || null, [plans, renewPlanId]);
  const availableNewSubscriptionPlans = useMemo(() => {
    const currentPlanMemberships = (renewMember?.plans || []).filter(
      (plan) =>
        ['active', 'suspended'].includes(plan.status) &&
        plan.subscriptionStatus === 'active' &&
        dateValue(plan.endDate) >= today(),
    );
    const activePlanIds = new Set(
      currentPlanMemberships
        .map((plan) => plan.planId)
        .filter(Boolean),
    );
    const activePlanVersionIds = new Set(
      currentPlanMemberships
        .map((plan) => plan.planVersionId)
        .filter(Boolean),
    );
    return newSubscriptionPlans.filter(
      (plan) =>
        plan.status === 'active' &&
        plan.planType === 'individual' &&
        !activePlanIds.has(plan.id) &&
        !activePlanVersionIds.has(plan.planVersionId),
    );
  }, [newSubscriptionPlans, renewMember]);
  const selectedNewPlanVersion = useMemo(
    () =>
      availableNewSubscriptionPlans.find(
        (plan) => plan.planVersionId === newSubscriptionPlanVersionId,
      ) || null,
    [availableNewSubscriptionPlans, newSubscriptionPlanVersionId],
  );
  const renewEndDate = useMemo(
    () => {
      if (renewMode === 'edit') return renewExistingEndDate;
      if (!renewStartDate) return '';
      if (subscriptionIntent === 'new' && selectedNewPlanVersion) {
        return addDaysToDate(
          renewStartDate,
          selectedNewPlanVersion.durationDays,
        );
      }
      if (selectedRenewPlan) {
        return addDaysToDate(renewStartDate, selectedRenewPlan.durationDays);
      }
      if (renewMultiSubscription) {
        const start = new Date(`${renewMultiSubscription.startDate}T00:00:00.000Z`);
        const end = new Date(`${renewMultiSubscription.endDate}T00:00:00.000Z`);
        const durationDays = Math.max(
          1,
          Math.round((end.getTime() - start.getTime()) / 86_400_000),
        );
        return addDaysToDate(renewStartDate, durationDays);
      }
      return '';
    },
    [
      renewExistingEndDate,
      renewMode,
      renewStartDate,
      renewMultiSubscription,
      selectedRenewPlan,
      selectedNewPlanVersion,
      subscriptionIntent,
    ],
  );

  const loadPlans = async () => {
    const [legacyResult, managedResult] = await Promise.allSettled([
      membershipApi.listPlans(),
      planManagementApi.listPlans(),
    ]);
    if (legacyResult.status === 'fulfilled') {
      setPlans(
        legacyResult.value.plans.filter((plan) => plan.status === 'active'),
      );
    }
    if (managedResult.status === 'fulfilled') {
      setNewSubscriptionPlans(
        managedResult.value.plans.filter(
          (plan) =>
            plan.status === 'active' && plan.planType === 'individual',
        ),
      );
    } else {
      setNewSubscriptionPlans([]);
      toast.error(
        managedResult.reason?.message ||
          'Failed to load active individual plans',
      );
    }
  };

  const loadMembers = async (
    requestedPage = memberPage,
    requestedPageSize = membersPerPage,
    clearFilters = false,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await membershipApi.listMembers({
        search: clearFilters ? '' : search,
        status: clearFilters ? '' : statusFilter,
        accessedToday: !clearFilters && accessFilter === 'today',
        accessDate:
          !clearFilters && accessFilter === 'date' ? accessDate : undefined,
        currentPlan: clearFilters ? '' : currentPlanFilter,
        paymentStatus: clearFilters ? '' : paymentStatusFilter,
        expiryDate: clearFilters ? '' : expiryDateFilter,
        sortBy: clearFilters ? 'joined_desc' : sortBy,
        page: requestedPage,
        pageSize: requestedPageSize,
      });
      setMembers(response.members);
      setMemberPagination(response.pagination);
      setMemberSummary(response.summary);
      setCurrentPlanOptions(response.filterOptions.currentPlans);
      setMemberPage(response.pagination.page);
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (subscriptionIntent !== 'new') return;
    setNewSubscriptionPlanVersionId((current) =>
      availableNewSubscriptionPlans.some(
        (plan) => plan.planVersionId === current,
      )
        ? current
        : availableNewSubscriptionPlans[0]?.planVersionId || '',
    );
  }, [availableNewSubscriptionPlans, subscriptionIntent]);

  const applyFilters = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setMemberPage(1);
    loadMembers(1);
  };

  const clearMemberFilters = () => {
    setSearch('');
    setStatusFilter('');
    setAccessFilter('');
    setAccessDate(today());
    setCurrentPlanFilter('');
    setPaymentStatusFilter('');
    setExpiryDateFilter('');
    setSortBy('joined_desc');
    setMemberPage(1);
    loadMembers(1, membersPerPage, true);
  };

  const changeMemberPage = (page: number) => {
    if (
      loading ||
      page < 1 ||
      page > memberPagination.totalPages ||
      page === memberPagination.page
    ) {
      return;
    }
    setMemberPage(page);
    loadMembers(page);
  };

  const changeMembersPerPage = (value: number) => {
    setMembersPerPage(value);
    setMemberPage(1);
    loadMembers(1, value);
  };

  const changePaymentStatus = async (
    member: MembershipMember,
    paymentStatus: 'paid' | 'pending',
  ) => {
    if (!member.multiUserSubscriptionId && !member.legacySubscriptionId) return;
    setPaymentUpdatingId(member.id);
    try {
      const result = member.multiUserSubscriptionId
        ? await subscriptionsV2Api.updatePaymentStatus(
            member.multiUserSubscriptionId,
            paymentStatus,
          )
        : await membershipApi.updateSubscriptionPaymentStatus(
            member.legacySubscriptionId!,
            { paymentStatus, paymentDate: today() },
          );
      toast.success(
        `${paymentStatus === 'paid' ? multiUserCopy.paid : multiUserCopy.pending} · Accounting: ${
          'accountingStatus' in result
            ? result.accountingStatus
            : paymentStatus === 'paid'
              ? 'posted'
              : 'pending'
        }`,
      );
      await loadMembers();
      if (detail?.member.id === member.id) {
        const response = await membershipApi.getMember(member.id);
        setDetail(response);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update payment status');
    } finally {
      setPaymentUpdatingId(null);
    }
  };

  const setPrimaryPlan = async (
    member: MembershipMember,
    affiliationId: string,
  ) => {
    try {
      await subscriptionsV2Api.setPrimaryAffiliation(affiliationId);
      toast.success(multiUserCopy.primaryUpdated);
      await loadMembers();
      if (detail?.member.id === member.id) {
        const response = await membershipApi.getMember(member.id);
        setDetail(response);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update the primary plan');
    }
  };

  const openCreate = () => {
    setEditMember(null);
    setMemberForm(emptyMemberForm);
    setFormOpen(true);
  };

  const openEdit = (member: MembershipMember) => {
    setEditMember(member);
    setMemberForm(toMemberForm(member));
    setFormOpen(true);
  };

  const updateMemberForm = (key: keyof MemberForm, value: string) => {
    setMemberForm((current) => ({ ...current, [key]: value }));
  };

  const submitMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const isCreating = !memberForm.id;
    try {
      const firstName = memberForm.firstName.trim();
      const lastName = memberForm.lastName.trim();
      let email = memberForm.email.trim();
      const phone = memberForm.phone.trim();

      // Validate: at least email or phone must be present
      if (!email && !phone) {
        toast.error('At least an email or phone number is required');
        setSaving(false);
        return;
      }

      // Auto-generate email if not provided
      if (!email && firstName && lastName) {
        email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@powergym.local`;
      }

      const payload = {
        firstName,
        lastName,
        email,
        phone,
        status: isCreating ? 'inactive' : memberForm.status,
        joinDate: memberForm.joinDate,
      };

      if (memberForm.id) {
        await membershipApi.updateMember(memberForm.id, payload);
        toast.success('Member updated');
        setFormOpen(false);
        await loadMembers();
      } else {
        const created = await membershipApi.createMember(payload);
        toast.success('Member created — select a plan to activate');
        setFormOpen(false);
        await loadMembers();
        // Open renew dialog immediately for the new member
        const newMember: MembershipMember = created.member;
        openNewSubscription(newMember);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save member');
    } finally {
      setSaving(false);
    }
  };

  const archiveMember = async (member: MembershipMember) => {
    setSaving(true);
    try {
      await membershipApi.archiveMember(member.id);
      toast.success('Member archived');
      setArchiveTarget(null);
      await loadMembers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to archive member');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (member: MembershipMember) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await membershipApi.getMember(member.id);
      setDetail(response);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load member detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectNewSubscriptionMember = (member: MembershipMember) => {
    setRenewMember(member);
    setRenewCurrentPlan(
      (member.plans || []).map((plan) => plan.planName).join(', ') ||
        member.currentPlan ||
        '',
    );
    setRenewCurrentExpiry(dateValue(member.currentExpiry));
  };

  const searchNewSubscriptionMembers = async () => {
    setNewSubscriptionSearching(true);
    try {
      const response = await membershipApi.listMembers({
        search: newSubscriptionMemberSearch,
        page: 1,
        pageSize: 50,
        sortBy: 'joined_desc',
      });
      setNewSubscriptionMemberOptions(response.members);
    } catch (err: any) {
      toast.error(err.message || 'Unable to search members');
    } finally {
      setNewSubscriptionSearching(false);
    }
  };

  const openNewSubscription = (preselectedMember?: MembershipMember) => {
    setSubscriptionIntent('new');
    setRenewMode('create');
    setNewSubscriptionRequiresMemberSelection(!preselectedMember);
    if (preselectedMember) {
      selectNewSubscriptionMember(preselectedMember);
    } else {
      setRenewMember(null);
      setRenewCurrentPlan('');
      setRenewCurrentExpiry('');
    }
    setRenewPaymentStatus('');
    setRenewPaymentDate('');
    setRenewStartDate(today());
    setRenewExistingLegacySubscriptionId(null);
    setRenewExistingEndDate('');
    setRenewPaymentLocked(false);
    setRenewMultiSubscription(null);
    setNewSubscriptionMemberSearch('');
    setNewSubscriptionMemberOptions(
      preselectedMember
        ? [preselectedMember]
        : members,
    );
    setNewSubscriptionPlanVersionId('');
    setRenewOpen(true);
  };

  useEffect(() => {
    if (pageSearchParams.get('newSubscription') !== '1' || renewOpen) return;
    openNewSubscription();
    const next = new URLSearchParams(pageSearchParams);
    next.delete('newSubscription');
    setPageSearchParams(next, { replace: true });
  }, [pageSearchParams, renewOpen]);

  const openRenew = async (member: MembershipMember) => {
    setSubscriptionIntent('renew');
    setRenewMember(member);
    setRenewPlanId(plans[0]?.id || '');
    setRenewCurrentExpiry('');
    setRenewCurrentPlan('');
    setRenewPaymentStatus('');
    setRenewPaymentDate('');
    setRenewMode('create');
    setRenewExistingLegacySubscriptionId(null);
    setRenewExistingEndDate('');
    setRenewPaymentLocked(false);
    setRenewMultiSubscription(null);
    setRenewStartDate(today());
    setRenewOpen(true);

    try {
      const [response, multiResponse] = await Promise.all([
        membershipApi.getMember(member.id),
        subscriptionsV2Api
          .listSubscriptions({ memberId: member.id, status: 'all' })
          .catch(() => ({ subscriptions: [] as SubscriptionV2[] })),
      ]);
      const multiSubscription =
        multiResponse.subscriptions
          .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0] ||
        null;
      const latestLegacySubscription = [...response.subscriptions].sort(
        (a, b) =>
          Number(b.status === 'active') - Number(a.status === 'active') ||
          String(b.endDate).localeCompare(String(a.endDate)),
      )[0];
      const currentExpiry =
        multiSubscription?.endDate ||
        getLatestSubscriptionEndDate(response.subscriptions);
      setRenewMultiSubscription(multiSubscription);
      setRenewCurrentPlan(
        multiSubscription?.planName ||
          latestLegacySubscription?.planName ||
          response.member.currentPlan ||
          '',
      );
      if (multiSubscription?.planId) {
        setRenewPlanId(multiSubscription.planId);
      }
      setRenewCurrentExpiry(currentExpiry);

      const currentMultiSubscription =
        multiSubscription?.status === 'active' &&
        dateValue(multiSubscription.endDate) >= today()
          ? multiSubscription
          : null;
      const multiSubscriptionInvoice = currentMultiSubscription
        ? response.invoices.find((invoice) => {
            const invoiceData = invoice.data || {};
            return (
              invoiceData.subscriptionV2Id === currentMultiSubscription.id &&
              (invoiceData.source !== 'subscription_v2_renewal' ||
                !invoiceData.periodEnd ||
                dateValue(invoiceData.periodEnd) ===
                  dateValue(currentMultiSubscription.endDate))
            );
          }) || null
        : null;
      const shouldEditMultiPayment = Boolean(
        currentMultiSubscription &&
          (['pending', 'partial', 'overdue'].includes(
            String(currentMultiSubscription.paymentStatus).toLowerCase(),
          ) ||
            multiSubscriptionInvoice?.data?.source ===
              'subscription_v2_renewal'),
      );
      const legacyInvoice = latestLegacySubscription
        ? response.invoices.find(
            (invoice) =>
              invoice.subscriptionId === latestLegacySubscription.id,
          ) || null
        : null;
      const isExistingLegacyRenewal = Boolean(
        latestLegacySubscription &&
          latestLegacySubscription.status === 'active' &&
          dateValue(latestLegacySubscription.endDate) >= today() &&
          legacyInvoice &&
          (paymentStatusFromInvoice(legacyInvoice) === 'pending' ||
            latestLegacySubscription.data?.source === 'renewal' ||
            latestLegacySubscription.data?.renewalOfSubscriptionId ||
            response.subscriptions.some(
              (subscription) =>
                subscription.id !== latestLegacySubscription.id,
            )),
      );

      if (
        currentMultiSubscription &&
        shouldEditMultiPayment
      ) {
        const paymentStatus = multiSubscriptionInvoice
          ? paymentStatusFromInvoice(multiSubscriptionInvoice)
          : String(currentMultiSubscription.paymentStatus).toLowerCase() ===
              'paid'
            ? 'paid'
            : 'pending';
        setRenewMode('edit');
        setRenewStartDate(dateValue(currentMultiSubscription.startDate));
        setRenewExistingEndDate(dateValue(currentMultiSubscription.endDate));
        setRenewPaymentStatus(paymentStatus);
        setRenewPaymentDate(
          multiSubscriptionInvoice
            ? paymentDateFromInvoice(multiSubscriptionInvoice)
            : dateValue(currentMultiSubscription.expectedPaymentDate),
        );
        setRenewPaymentLocked(paymentStatus === 'paid');
      } else if (isExistingLegacyRenewal && latestLegacySubscription) {
        const paymentStatus = paymentStatusFromInvoice(legacyInvoice);
        setRenewMode('edit');
        setRenewMultiSubscription(null);
        setRenewPlanId(latestLegacySubscription.planId || plans[0]?.id || '');
        setRenewStartDate(dateValue(latestLegacySubscription.startDate));
        setRenewExistingEndDate(dateValue(latestLegacySubscription.endDate));
        setRenewExistingLegacySubscriptionId(latestLegacySubscription.id);
        setRenewPaymentStatus(paymentStatus);
        setRenewPaymentDate(paymentDateFromInvoice(legacyInvoice));
        setRenewPaymentLocked(paymentStatus === 'paid');
      } else {
        setRenewStartDate(computeRenewalStartDate(currentExpiry));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to calculate renewal dates');
    }
  };

  const submitRenewal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renewMember) {
      toast.error('Select an existing member.');
      return;
    }
    if (!renewPaymentStatus) {
      toast.error('Select Paid or Payment pending.');
      return;
    }
    if (!renewPaymentDate) {
      toast.error(
        renewPaymentStatus === 'paid'
          ? 'Payment date is required.'
          : 'Estimated payment date is required.',
      );
      return;
    }
    if (renewPaymentStatus === 'pending' && renewPaymentDate > renewEndDate) {
      toast.error('Estimated payment date cannot be after End Date.');
      return;
    }
    if (renewPaymentStatus === 'pending' && renewPaymentDate < today()) {
      toast.error('Estimated payment date cannot be in the past.');
      return;
    }
    setSaving(true);
    try {
      if (subscriptionIntent === 'new') {
        if (!selectedNewPlanVersion) {
          throw new Error('Select an active plan.');
        }
        await subscriptionsV2Api.createSubscription({
          planVersionId: selectedNewPlanVersion.planVersionId,
          holderMemberId: renewMember.id,
          startDate: renewStartDate,
          endDate: renewEndDate,
          paymentStatus: renewPaymentStatus,
          paymentDate: renewPaymentDate,
        });
        toast.success('New subscription created and assigned to the member');
        setRenewOpen(false);
        await loadMembers();
        return;
      }
      if (renewMode === 'edit') {
        if (renewMultiSubscription) {
          await subscriptionsV2Api.updatePaymentStatus(
            renewMultiSubscription.id,
            renewPaymentStatus,
            renewPaymentDate,
          );
        } else if (renewExistingLegacySubscriptionId) {
          await membershipApi.updateSubscriptionPaymentStatus(
            renewExistingLegacySubscriptionId,
            {
              paymentStatus: renewPaymentStatus,
              paymentDate: renewPaymentDate,
            },
          );
        } else {
          throw new Error('Existing renewal subscription was not found.');
        }
        toast.success('Subscription payment updated');
        setRenewOpen(false);
        await loadMembers();
        if (detail?.member.id === renewMember.id) {
          const response = await membershipApi.getMember(renewMember.id);
          setDetail(response);
        }
        return;
      }
      if (renewMultiSubscription) {
        await subscriptionsV2Api.renewSubscription(
          renewMultiSubscription.id,
          {
            paymentStatus: renewPaymentStatus,
            paymentDate: renewPaymentDate,
          },
        );
        toast.success('Subscription renewed and invoice created');
        setRenewOpen(false);
        await loadMembers();
        return;
      }
      const plan = plans.find((item) => item.id === renewPlanId);
      if (!plan) throw new Error('Select an active plan before renewing.');
      await membershipApi.createSubscription(renewMember.id, {
        planId: plan.id,
        createInvoice: true,
        paymentStatus: renewPaymentStatus,
        paymentDate: renewPaymentDate,
      });
      toast.success('Subscription renewed and invoice created');
      setRenewOpen(false);
      await loadMembers();
      if (detail?.member.id === renewMember.id) {
        const response = await membershipApi.getMember(renewMember.id);
        setDetail(response);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to renew subscription');
    } finally {
      setSaving(false);
    }
  };

  const openQr = async (member: MembershipMember) => {
    setQrMember(member);
    setAccessToken('');
    setQrTokenId('');
    const knownPlan = (member.plans || [])
      .filter((plan) => plan.status === 'active' && plan.endDate)
      .sort((left, right) => String(right.endDate).localeCompare(String(left.endDate)))[0];
    setQrExpiryDate(
      String(knownPlan?.endDate || member.currentExpiry || member.multiUserSubscriptionEndDate || '').slice(0, 10),
    );
    setQrPlanName(knownPlan?.planName || member.currentPlan || '');
    setQrOpen(true);

    try {
      const response = await membershipApi.getMember(member.id);
      const latest = response.subscriptions
        .filter((subscription) => subscription.status === 'active' && subscription.endDate)
        .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0];
      const latestV2 = (response.member.plans || [])
        .filter((plan) => plan.status === 'active' && plan.endDate)
        .sort((left, right) => String(right.endDate).localeCompare(String(left.endDate)))[0];
      const expiry =
        latestV2?.endDate ||
        latest?.endDate ||
        response.member.currentExpiry ||
        response.member.multiUserSubscriptionEndDate;
      setQrExpiryDate(expiry ? String(expiry).slice(0, 10) : '');
      setQrPlanName(latestV2?.planName || latest?.planName || member.currentPlan || '');
    } catch (err: any) {
      toast.error(err.message || 'Failed to load QR expiry date');
    }
  };

  const generateToken = async () => {
    if (!qrMember) return;
    setSaving(true);
    try {
      const response = await membershipApi.generateAccessToken(qrMember.id);
      setAccessToken(response.token);
      setQrTokenId(response.tokenId || '');
      setQrExpiryDate(response.expiryDate || response.expiresAt?.slice(0, 10) || qrExpiryDate);
      if (response.planName) setQrPlanName(response.planName);
      toast.success('E-card token generated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate e-card token');
    } finally {
      setSaving(false);
    }
  };

  const markInvoicePaid = async (invoice: MembershipInvoice) => {
    try {
      await membershipApi.markInvoicePaid(invoice.id);
      toast.success('Invoice marked as paid');
      if (detail?.member.id) {
        const response = await membershipApi.getMember(detail.member.id);
        setDetail(response);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update invoice');
    }
  };

  const downloadInvoiceReceipt = async (invoice: MembershipInvoice) => {
    try {
      await membershipApi.downloadInvoiceReceipt(invoice.id, invoice.invoiceNumber);
    } catch (err: any) {
      toast.error(err.message || 'Failed to download receipt PDF');
    }
  };

  const buildQrMessage = () => {
    const name = `${qrMember?.firstName || ''} ${qrMember?.lastName || ''}`.trim();
    return `PowerGym QR e-Card for ${name || 'member'}
Plan: ${qrPlanName || 'Not available'}
Expiry Date: ${qrExpiryDate || 'Not available'}

The secure QR token is embedded in the attached PDF/QR image.`;
  };

  const getQrImageData = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) throw new Error('QR code is not ready yet. Generate the token and try again.');
    return canvas.toDataURL('image/png');
  };

  const ecardFileName = () => {
    const name = `${qrMember?.firstName || ''}_${qrMember?.lastName || ''}`.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return `${name || 'PowerGym'}_QR_eCard.pdf`;
  };

  const downloadQrPdf = async () => {
    if (!qrMember || !accessToken || !qrTokenId) return;
    setSaving(true);
    try {
      await membershipApi.downloadEcardPdf(qrMember.id, { token: accessToken, tokenId: qrTokenId, qrImageData: getQrImageData(), fileName: ecardFileName() });
      toast.success('QR e-card PDF downloaded');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download QR e-card PDF');
    } finally {
      setSaving(false);
    }
  };

  const shareOrDownloadPdfFallback = async (channel: 'email' | 'whatsapp') => {
    if (!qrMember || !accessToken || !qrTokenId) return;
    const blob = await membershipApi.getEcardPdfBlob(qrMember.id, { token: accessToken, tokenId: qrTokenId, qrImageData: getQrImageData() });
    const file = new File([blob], ecardFileName(), { type: 'application/pdf' });
    if (channel === 'whatsapp' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'PowerGym QR e-Card', text: buildQrMessage() });
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    if (channel === 'email' && qrMember.email) {
      const subject = encodeURIComponent('Your PowerGym QR e-Card PDF');
      const body = encodeURIComponent(`${buildQrMessage()}\n\nThe PDF file has been downloaded. Please attach it if your email client did not attach automatically.`);
      window.location.href = `mailto:${qrMember.email}?subject=${subject}&body=${body}`;
    } else if (channel === 'whatsapp') {
      const phone = normalizeWhatsAppPhone(qrMember.phone);
      const text = encodeURIComponent(`${buildQrMessage()}\n\nThe PDF file has been downloaded. Please attach/share it in WhatsApp.`);
      window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
    }
  };

  const sendQrPdf = async (channel: 'email' | 'whatsapp') => {
    if (!qrMember || !accessToken || !qrTokenId) return;
    setSaving(true);
    try {
      await membershipApi.deliverEcardPdf(qrMember.id, { channel, token: accessToken, tokenId: qrTokenId, qrImageData: getQrImageData(), email: qrMember.email, phone: qrMember.phone });
      toast.success(`QR e-card PDF sent by ${channel === 'email' ? 'email' : 'WhatsApp'}`);
    } catch (err: any) {
      if (err.status === 501) {
        toast.info(`${channel === 'email' ? 'Email' : 'WhatsApp'} provider is not configured; downloading PDF for manual sending.`);
        try {
          await shareOrDownloadPdfFallback(channel);
        } catch (fallbackError: any) {
          toast.error(fallbackError.message || 'Failed to prepare QR e-card PDF fallback');
        }
      } else {
        toast.error(err.message || `Failed to send QR e-card PDF by ${channel}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Members</h1>
          <p className="mt-1 text-sm text-slate-500">
            Backend-connected member records, subscription renewals, invoices, and QR e-card generation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openNewSubscription()}>
            <CreditCard className="mr-2 h-4 w-4" /> {multiUserCopy.newSubscriptions}
          </Button>
          <Button variant="outline" asChild>
            <Link to={newMultiUserUrl()}>{multiUserCopy.create}</Link>
          </Button>
          <Button variant="outline" onClick={() => { loadPlans(); loadMembers(); }} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New Member
          </Button>
        </div>
      </div>

      {error && (
        <InlineAlert title="Members API unavailable" variant="warning">
          <p>{error}</p>
          <p className="mt-1 text-xs">Confirm you are signed in and MySQL is configured, then run npm run db:migrate.</p>
        </InlineAlert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Members</CardDescription>
            <CardTitle className="text-2xl">{memberSummary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active Members</CardDescription>
            <CardTitle className="text-2xl">{memberSummary.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Archived Members</CardDescription>
            <CardTitle className="text-2xl">{memberSummary.archived}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member Directory</CardTitle>
          <CardDescription>Search, create, renew, and issue QR e-cards.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={applyFilters}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
          >
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="memberSearch">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                <Input
                  id="memberSearch"
                  className="pl-8"
                  placeholder="Search by name, email, or phone"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="memberStatusFilter">Member status</Label>
              <select
                id="memberStatusFilter"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                {MEMBER_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="currentPlanFilter">{multiUserCopy.currentPlanFilter}</Label>
              <select
                id="currentPlanFilter"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={currentPlanFilter}
                onChange={(event) => setCurrentPlanFilter(event.target.value)}
              >
                <option value="">{multiUserCopy.allCurrentPlans}</option>
                {currentPlanFilter &&
                  !currentPlanOptions.includes(currentPlanFilter) && (
                    <option value={currentPlanFilter}>
                      {currentPlanFilter}
                    </option>
                  )}
                {currentPlanOptions.map((planName) => (
                  <option key={planName} value={planName}>{planName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="paymentStatusFilter">{multiUserCopy.paymentStatusFilter}</Label>
              <select
                id="paymentStatusFilter"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={paymentStatusFilter}
                onChange={(event) => setPaymentStatusFilter(event.target.value)}
              >
                <option value="">{multiUserCopy.allPaymentStatuses}</option>
                <option value="paid">{multiUserCopy.paid}</option>
                <option value="pending">{multiUserCopy.pending}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="expiryDateFilter">{multiUserCopy.expiryDateFilter}</Label>
              <DateInput
                id="expiryDateFilter"
                value={expiryDateFilter}
                onChange={setExpiryDateFilter}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="memberAccessFilter">Last Access</Label>
              <select
                id="memberAccessFilter"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={accessFilter}
                onChange={(event) => setAccessFilter(event.target.value)}
              >
                <option value="">All access dates</option>
                <option value="today">Accessed today</option>
                <option value="date">Accessed on date</option>
              </select>
            </div>
            {accessFilter === 'date' && (
              <div className="space-y-1">
                <Label htmlFor="memberAccessDate">Access Date</Label>
                <DateInput
                  id="memberAccessDate"
                  value={accessDate}
                  onChange={setAccessDate}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="memberSortBy">{multiUserCopy.sortBy}</Label>
              <select
                id="memberSortBy"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="expiry_asc">{multiUserCopy.expiryAsc}</option>
                <option value="expiry_desc">{multiUserCopy.expiryDesc}</option>
                <option value="joined_asc">{multiUserCopy.joinedAsc}</option>
                <option value="joined_desc">{multiUserCopy.joinedDesc}</option>
                <option value="last_access_asc">{multiUserCopy.lastAccessAsc}</option>
                <option value="last_access_desc">{multiUserCopy.lastAccessDesc}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="membersPerPage">{multiUserCopy.membersPerPage}</Label>
              <select
                id="membersPerPage"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={membersPerPage}
                onChange={(event) =>
                  changeMembersPerPage(Number(event.target.value))
                }
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={loading}>{multiUserCopy.apply}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearMemberFilters}
                disabled={loading}
              >
                {multiUserCopy.clear}
              </Button>
            </div>
          </form>

          <ScreenReportActions
            compact
            reportIds={['members-directory', 'subscriptions-validity', 'invoices-collection']}
            params={{ status: statusFilter, q: search }}
            title="Member screen PDFs"
            description="Download member, subscription and collection PDFs using the same status/search context as this screen."
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Current Plan</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last Access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-slate-500">Loading members...</TableCell></TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8">
                    <EmptyState
                      compact
                      title="No members match these filters"
                      description="Try clearing the member, plan, payment, expiry, or access filters before creating a new member."
                      actionLabel="Clear filters"
                      onAction={clearMemberFilters}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id} className={member.paymentAttentionRequired ? 'bg-red-50 hover:bg-red-100' : undefined}>
                    <TableCell>
                      {member.subscriptionType === 'multi_user' ? (
                        <button
                          type="button"
                          className="font-medium text-slate-900 underline decoration-dotted underline-offset-4 hover:text-indigo-700"
                          onClick={() => setExpandedGroupMemberId((current) => current === member.id ? null : member.id)}
                        >
                          {member.firstName} {member.lastName}
                        </button>
                      ) : (
                        <div className="font-medium text-slate-900">{member.firstName} {member.lastName}</div>
                      )}
                      <div className="text-xs text-slate-500">{member.id}</div>
                      {expandedGroupMemberId === member.id && member.subscriptionType === 'multi_user' && (
                        <div className="mt-2 max-w-xs rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-xs text-indigo-950 shadow-sm">
                          <p className="font-semibold">{multiUserCopy.otherMembers}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(member.multiUserMembers || [])
                              .filter((groupMember) => groupMember.memberId !== member.id)
                              .map((groupMember) => (
                                <span key={groupMember.memberId} className="rounded-full bg-white px-2 py-1 ring-1 ring-indigo-200">
                                  {groupMember.name} · {groupMember.role}
                                </span>
                              ))}
                            {(member.multiUserMembers || []).filter((groupMember) => groupMember.memberId !== member.id).length === 0 && (
                              <span className="text-indigo-700">—</span>
                            )}
                          </div>
                          {member.multiUserCapacity && (
                            <p className="mt-2 font-medium">
                              {multiUserCopy.capacity}: {member.multiUserCapacity.occupied}/{member.multiUserCapacity.maximum}
                              {' · '}
                              {multiUserCopy.available}: {member.multiUserCapacity.available}
                            </p>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{member.email}</div>
                      <div className="text-xs text-slate-500">{member.phone || 'No phone'}</div>
                    </TableCell>
                    <TableCell>
                      {(member.plans || []).length > 0 ? (
                        <div className="space-y-2">
                          {(member.plans || []).map((plan) => {
                            const planKey = `${member.id}:${plan.id}`;
                            return (
                              <div
                                key={plan.id}
                                className="rounded-lg border border-slate-200 bg-white p-2"
                              >
                                <button
                                  type="button"
                                  className="block text-left font-medium text-slate-900 underline decoration-dotted underline-offset-4 hover:text-indigo-700"
                                  onClick={() =>
                                    setExpandedPlanKey((current) =>
                                      current === planKey ? null : planKey,
                                    )
                                  }
                                >
                                  {plan.planName}
                                </button>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <Badge variant={plan.isPrimary ? 'default' : 'outline'}>
                                    {plan.planType === 'individual'
                                      ? 'Individual'
                                      : `Multi-user · ${plan.role}`}
                                    {plan.isPrimary ? ' · Primary' : ''}
                                  </Badge>
                                  {!plan.sessionsUnlimited && (
                                    <>
                                      <Badge variant="secondary">
                                        {multiUserCopy.consumed}: {plan.sessionsConsumed ?? 0}
                                      </Badge>
                                      <Badge variant="outline">
                                        {multiUserCopy.remaining}: {plan.sessionsPending ?? 0}
                                      </Badge>
                                      {(plan.sessionsReserved ?? 0) > 0 && (
                                        <Badge variant="outline">
                                          {multiUserCopy.reserved}: {plan.sessionsReserved}
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                  {!plan.isPrimary && plan.affiliationId && (
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-indigo-700 underline underline-offset-2"
                                      onClick={() =>
                                        setPrimaryPlan(member, plan.affiliationId!)
                                      }
                                    >
                                      {multiUserCopy.setPrimary}
                                    </button>
                                  )}
                                </div>
                                {expandedPlanKey === planKey && (
                                  <div className="mt-2 max-w-sm rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950 shadow-sm">
                                    {reducedDescription(plan.description) ||
                                      'No plan description available.'}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : member.currentPlan ? (
                        <div>
                          <button
                            type="button"
                            className="text-left font-medium text-slate-900 underline decoration-dotted underline-offset-4 hover:text-indigo-700"
                            onClick={() =>
                              setExpandedPlanKey((current) =>
                                current === `${member.id}:current`
                                  ? null
                                  : `${member.id}:current`,
                              )
                            }
                          >
                            {member.currentPlan}
                          </button>
                          {expandedPlanKey === `${member.id}:current` && (
                            <div className="mt-2 max-w-sm rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950 shadow-sm">
                              {reducedDescription(member.planDescription) ||
                                'No plan description available.'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline">No subscription</Badge>
                      )}
                      {member.paymentAttentionRequired && (
                        <Badge variant="destructive" className="ms-1 mt-1">
                          Payment {member.paymentStatus || 'pending'}
                        </Badge>
                      )}
                      {(member.multiUserSubscriptionId || member.legacySubscriptionId) && (
                        <select
                          aria-label="Payment status"
                          className="mt-2 block h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                          value={member.paymentStatus === 'paid' ? 'paid' : 'pending'}
                          disabled={paymentUpdatingId === member.id || member.paymentStatus === 'paid'}
                          title={member.paymentStatus === 'paid' ? 'Paid subscriptions are locked' : undefined}
                          onChange={(event) => void changePaymentStatus(member, event.target.value as 'paid' | 'pending')}
                        >
                          <option value="paid">{multiUserCopy.paid}</option>
                          <option value="pending">{multiUserCopy.pending}</option>
                        </select>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(member.currentExpiry)}</TableCell>
                    <TableCell>{formatDate(member.joinDate)}</TableCell>
                    <TableCell>{formatDate(member.lastAccess)}</TableCell>
                    <TableCell><Badge variant={badgeVariant(getEffectiveMemberStatus(member)) as any}>{getEffectiveMemberStatus(member)}</Badge></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openDetail(member)}><Eye className="mr-1 h-3.5 w-3.5" /> View</Button>
                        <Button variant="outline" size="sm" onClick={() => openRenew(member)}><CreditCard className="mr-1 h-3.5 w-3.5" /> Renew</Button>
                        <Button variant="outline" size="sm" onClick={() => openQr(member)}><QrCode className="mr-1 h-3.5 w-3.5" /> QR</Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(member)}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setArchiveTarget(member)}
                          disabled={member.holderActionLocked}
                          title={
                            member.holderActionLocked
                              ? 'Transfer the holder role before archiving this member'
                              : undefined
                          }
                        >
                          <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 border-t pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {multiUserCopy.showing}{' '}
              {memberPagination.total === 0
                ? 0
                : (memberPagination.page - 1) * memberPagination.pageSize + 1}
              –
              {Math.min(
                memberPagination.page * memberPagination.pageSize,
                memberPagination.total,
              )}{' '}
              {multiUserCopy.of} {memberPagination.total} {multiUserCopy.members}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || memberPagination.page <= 1}
                onClick={() => changeMemberPage(memberPagination.page - 1)}
              >
                {multiUserCopy.previous}
              </Button>
              {paginationPages.map((page, index) => (
                <div key={page} className="flex items-center gap-1">
                  {index > 0 &&
                    page - paginationPages[index - 1] > 1 && (
                      <span className="px-1 text-slate-400">…</span>
                    )}
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      page === memberPagination.page ? 'default' : 'outline'
                    }
                    disabled={loading}
                    onClick={() => changeMemberPage(page)}
                    aria-label={`Page ${page}`}
                    aria-current={
                      page === memberPagination.page ? 'page' : undefined
                    }
                  >
                    {page}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  loading ||
                  memberPagination.page >= memberPagination.totalPages
                }
                onClick={() => changeMemberPage(memberPagination.page + 1)}
              >
                {multiUserCopy.next}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}
        title="Archive member?"
        description={`This will archive ${archiveTarget?.firstName || 'this'} ${archiveTarget?.lastName || 'member'} and remove them from active operations. Existing history and invoices remain available.`}
        confirmLabel="Archive member"
        confirmVariant="destructive"
        busy={saving}
        onConfirm={async () => { if (archiveTarget) await archiveMember(archiveTarget); }}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{memberForm.id ? 'Edit Member' : 'Create Member'}</DialogTitle></DialogHeader>
          <form onSubmit={submitMember} className="min-w-0 space-y-4">
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" value={memberForm.firstName} onChange={(event) => updateMemberForm('firstName', event.target.value)} required />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" value={memberForm.lastName} onChange={(event) => updateMemberForm('lastName', event.target.value)} required />
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={memberForm.email} onChange={(event) => updateMemberForm('email', event.target.value)} placeholder="optional if phone provided" />
                <p className="text-xs text-slate-500">If not provided, auto-generated as firstname.lastname@powergym.local</p>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={memberForm.phone} onChange={(event) => updateMemberForm('phone', event.target.value)} placeholder="optional if email provided" />
              </div>
            </div>
            <div className={`grid min-w-0 grid-cols-1 gap-4 ${memberForm.id ? 'md:grid-cols-2' : ''}`}>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="joinDate">Join Date</Label>
                <DateInput id="joinDate" value={memberForm.joinDate} onChange={(v) => console.log(v)} />
              </div>
              {memberForm.id && (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="memberStatus">Status</Label>
                  <select
                    id="memberStatus"
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={memberForm.status}
                    onChange={(event) => updateMemberForm('status', event.target.value)}
                  >
                    {MEMBER_STATUSES.map((status) => (
                      <option
                        key={status.value}
                        value={status.value}
                        disabled={
                          Boolean(editMember?.holderActionLocked) &&
                          status.value !== 'active'
                        }
                      >
                        {status.label}
                      </option>
                    ))}
                  </select>
                  {editMember?.holderActionLocked && (
                    <p className="text-xs text-amber-700">
                      Transfer the holder role to an active beneficiary before
                      suspending, cancelling or archiving this member.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {memberForm.id && (
                <>
                  <Button type="button" variant="outline" asChild>
                    <Link to={newMultiUserUrl(memberForm.id)}>{multiUserCopy.create}</Link>
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to={manageBeneficiariesUrl(memberForm.id)}>{multiUserCopy.manage}</Link>
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : memberForm.id ? 'Save Member' : 'Select a Plan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {subscriptionIntent === 'new'
                ? multiUserCopy.newSubscriptions
                : renewMode === 'edit'
                ? 'Edit Subscription Payment'
                : 'Renew Subscription'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitRenewal} className="min-w-0 space-y-4">
            {subscriptionIntent === 'new' &&
              newSubscriptionRequiresMemberSelection && (
              <div className="space-y-2 rounded-lg border bg-slate-50 p-3">
                <Label htmlFor="newSubscriptionMemberSearch">
                  {multiUserCopy.searchExistingMember}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="newSubscriptionMemberSearch"
                    value={newSubscriptionMemberSearch}
                    onChange={(event) =>
                      setNewSubscriptionMemberSearch(event.target.value)
                    }
                    placeholder="Name, email, phone or member ID"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={newSubscriptionSearching}
                    onClick={() => void searchNewSubscriptionMembers()}
                  >
                    {newSubscriptionSearching ? 'Searching...' : 'Search'}
                  </Button>
                </div>
                <select
                  className="h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm"
                  value={renewMember?.id || ''}
                  onChange={(event) => {
                    const selected = newSubscriptionMemberOptions.find(
                      (member) => member.id === event.target.value,
                    );
                    if (selected) selectNewSubscriptionMember(selected);
                  }}
                  required
                >
                  <option value="">{multiUserCopy.selectExistingMember}</option>
                  {newSubscriptionMemberOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.firstName} {member.lastName} · {member.email || member.phone || member.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {renewMember && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-900">{renewMember.firstName} {renewMember.lastName}</p>
                <p className="text-slate-500">
                  Current plans: {renewCurrentPlan || 'No active plan'}
                </p>
                {renewMode === 'edit' && (
                  <p className="mt-1 text-slate-500">
                    Editing the payment information of the existing, unexpired subscription or renewal.
                  </p>
                )}
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <Label htmlFor="renewPlan">Plan</Label>
              {subscriptionIntent === 'new' ? (
                <select
                  id="renewPlan"
                  className="h-9 w-full min-w-0 max-w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={newSubscriptionPlanVersionId}
                  onChange={(event) =>
                    setNewSubscriptionPlanVersionId(event.target.value)
                  }
                  required
                >
                  {availableNewSubscriptionPlans.length === 0 && (
                    <option value="">
                      No other active individual plans available
                    </option>
                  )}
                  {availableNewSubscriptionPlans.map((plan) => (
                    <option
                      key={plan.planVersionId}
                      value={plan.planVersionId}
                    >
                      {plan.name} · {formatMoney(plan.price, plan.currency)} /{' '}
                      {plan.durationDays} days
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  id="renewPlan"
                  className="h-9 w-full min-w-0 max-w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={renewPlanId}
                  onChange={(event) => setRenewPlanId(event.target.value)}
                  disabled={Boolean(renewMultiSubscription) || renewMode === 'edit'}
                  required
                >
                  {renewMultiSubscription ? (
                    <option value={renewMultiSubscription.planId}>
                      {renewMultiSubscription.planName}
                    </option>
                  ) : (
                    <>
                      {renewMode === 'edit' &&
                        renewPlanId &&
                        !plans.some((plan) => plan.id === renewPlanId) && (
                          <option value={renewPlanId}>
                            {renewCurrentPlan || 'Existing plan'}
                          </option>
                        )}
                      {plans.length === 0 && <option value="">No active plans available</option>}
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name} - {formatMoney(plan.price, plan.currency)} / {plan.durationDays} days</option>
                      ))}
                    </>
                  )}
                </select>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {renewMode === 'edit'
                    ? 'Subscription Expiry'
                    : 'Current Expiry'}
                </Label>
                <Input value={renewCurrentExpiry ? formatDate(renewCurrentExpiry) : 'No active subscription'} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" value={formatDate(renewStartDate)} readOnly disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" value={formatDate(renewEndDate)} readOnly disabled />
              <p className="text-xs text-slate-500">
                {renewMode === 'edit'
                  ? 'Start Date and End Date belong to the existing renewal and cannot be changed here.'
                  : 'End Date is calculated automatically from the renewal start date plus the selected plan duration.'}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="renewPaymentStatus">Payment status</Label>
                <select
                  id="renewPaymentStatus"
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={renewPaymentStatus}
                  required
                  disabled={renewPaymentLocked}
                  onChange={(event) => {
                    const value = event.target.value as '' | 'paid' | 'pending';
                    setRenewPaymentStatus(value);
                    setRenewPaymentDate(
                      value === 'paid'
                        ? today()
                        : renewMode === 'edit'
                          ? renewPaymentDate
                          : '',
                    );
                  }}
                >
                  <option value="">Select payment status</option>
                  <option value="paid">{multiUserCopy.paid}</option>
                  <option value="pending">{multiUserCopy.pending}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewPaymentDate">
                  {renewPaymentStatus === 'paid'
                    ? 'Payment date'
                    : 'Estimated payment date'}
                </Label>
                <DateInput
                  id="renewPaymentDate"
                  value={renewPaymentDate}
                  onChange={setRenewPaymentDate}
                  min={today()}
                  max={renewEndDate}
                  required
                  readOnly={renewPaymentStatus === 'paid' || renewPaymentLocked}
                  disabled={!renewPaymentStatus || renewPaymentLocked}
                />
                <p className="text-xs text-slate-500">
                  {renewPaymentStatus === 'paid'
                    ? 'Paid subscriptions use today as the payment date.'
                    : 'Pending payment date must be today or later and cannot exceed End Date.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {renewMember && (
                <>
                  <Button type="button" variant="outline" asChild>
                    <Link to={newMultiUserUrl(renewMember.id)}>{multiUserCopy.create}</Link>
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to={manageBeneficiariesUrl(renewMember.id)}>{multiUserCopy.manage}</Link>
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={() => setRenewOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  renewPaymentLocked ||
                  !renewPaymentStatus ||
                  !renewPaymentDate ||
                  (subscriptionIntent === 'new'
                    ? !renewMember || !selectedNewPlanVersion
                    : renewMode === 'create' &&
                      !renewMultiSubscription &&
                      plans.length === 0)
                }
              >
                {saving
                  ? subscriptionIntent === 'new'
                    ? 'Creating...'
                    : renewMode === 'edit'
                    ? 'Saving...'
                    : 'Renewing...'
                  : renewPaymentLocked
                    ? 'Payment already paid'
                    : subscriptionIntent === 'new'
                      ? 'Create Subscription'
                      : renewMode === 'edit'
                      ? 'Save Payment'
                      : renewMultiSubscription
                        ? 'Renew Subscription'
                        : 'Renew & Invoice'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>QR E-card</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{qrMember?.firstName} {qrMember?.lastName}</p>
              <p className="text-slate-500">Generate a secure QR token and PDF e-card for scanner validation.</p>
              <p className="text-slate-500">Plan: {qrPlanName || 'No active plan'}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qrExpiryDate">Expiry Date</Label>
              <DateInput id="qrExpiryDate" value={qrExpiryDate} onChange={() => {}} readOnly disabled />
              <p className="text-xs text-slate-500">Expiry Date is locked and derived from the member's active subscription.</p>
            </div>
            <Button
              onClick={generateToken}
              disabled={saving || !qrMember || String(qrMember.status).toLowerCase() !== 'active'}
              className="w-full"
            >
              <IdCard className="mr-2 h-4 w-4" /> {saving ? 'Generating...' : 'Generate E-card Token'}
            </Button>
            {accessToken && (
              <div className="space-y-3 rounded-xl border bg-white p-4 text-center">
                <QRCodeCanvas ref={qrCanvasRef} value={accessToken} size={180} includeMargin className="mx-auto" />
                <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">Secure token generated. The raw value is embedded only in the QR code and is not displayed.</p>
                <Button variant="outline" onClick={downloadQrPdf} className="w-full" disabled={saving}>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <Button variant="outline" onClick={() => sendQrPdf('email')} disabled={!qrMember?.email || saving}>
                    <Mail className="mr-2 h-4 w-4" /> Email PDF
                  </Button>
                  <Button variant="outline" onClick={() => sendQrPdf('whatsapp')} disabled={saving}>
                    <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp PDF
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Configured providers send the PDF directly. If no provider is configured, the app downloads/shares the PDF for manual sending.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Member Profile</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            {detailLoading && <p className="text-sm text-slate-500">Loading profile...</p>}
            {detail && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{detail.member.firstName} {detail.member.lastName}</CardTitle>
                    <CardDescription>{detail.member.email} · {detail.member.phone || 'No phone'}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                    <div><span className="text-slate-500">Status:</span> <Badge variant={badgeVariant(getEffectiveMemberStatus(detail.member)) as any}>{getEffectiveMemberStatus(detail.member)}</Badge></div>
                    <div><span className="text-slate-500">Joined:</span> {formatDate(detail.member.joinDate)}</div>
                    <div><span className="text-slate-500">Current Plan:</span> {detail.member.currentPlan || '—'}</div>
                    <div><span className="text-slate-500">Expiry:</span> {formatDate(detail.member.currentExpiry)}</div>
                    <div><span className="text-slate-500">Payment:</span> <Badge variant={detail.member.paymentAttentionRequired ? 'destructive' : 'outline'}>{detail.member.paymentStatus || '—'}</Badge></div>
                    <div>
                      <span className="text-slate-500">Subscription type:</span>{' '}
                      {detail.member.subscriptionType === 'multi_user'
                        ? `Multi-user · ${detail.member.multiUserRole === 'holder' ? 'Holder' : 'Beneficiary'}${detail.member.multiUserPlanType ? ` · ${detail.member.multiUserPlanType}` : ''}`
                        : detail.member.subscriptionType === 'individual'
                          ? 'Individual'
                          : 'No subscription'}
                    </div>
                    <div><span className="text-slate-500">Last Access:</span> {formatDate(detail.member.lastAccess)}</div>
                    <div><span className="text-slate-500">Member ID:</span> {detail.member.id}</div>
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={newMultiUserUrl(detail.member.id)}>{multiUserCopy.create}</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={manageBeneficiariesUrl(detail.member.id)}>{multiUserCopy.manage}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {getLatestInvoice(detail.invoices) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Last Receipt</CardTitle>
                      <CardDescription>Download the most recent subscription receipt/invoice for this member.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">{getLatestInvoice(detail.invoices)?.invoiceNumber}</p>
                        <p className="text-slate-500">{formatMoney(getLatestInvoice(detail.invoices)?.total || 0, getLatestInvoice(detail.invoices)?.currency || 'USD')} · {getLatestInvoice(detail.invoices)?.status}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { const invoice = getLatestInvoice(detail.invoices); if (invoice) void downloadInvoiceReceipt(invoice); }}>
                        <FileText className="mr-2 h-4 w-4" /> Download receipt PDF
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Subscriptions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detail.subscriptions.length === 0 ? (
                      <p className="text-sm text-slate-500">No subscriptions recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.subscriptions.map((subscription) => (
                          <div key={subscription.id} className="rounded-lg border p-3 text-sm">
                            <div className="flex justify-between gap-3">
                              <p className="font-medium">{subscription.planName}</p>
                              <Badge variant={badgeVariant(subscription.status) as any}>{subscription.status}</Badge>
                            </div>
                            <p className="text-slate-500">{formatDate(subscription.startDate)} - {formatDate(subscription.endDate)}</p>
                            <p className="text-slate-500">{formatMoney(subscription.price, subscription.currency)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Invoices</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detail.invoices.length === 0 ? (
                      <p className="text-sm text-slate-500">No invoices recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.invoices.map((invoice) => (
                          <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                            <div>
                              <p className="font-medium">{invoice.invoiceNumber}</p>
                              <p className="text-slate-500">Due {formatDate(invoice.dueDate)} · {formatMoney(invoice.total, invoice.currency)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={badgeVariant(invoice.status) as any}>{invoice.status}</Badge>
                              <Button size="sm" variant="outline" onClick={() => downloadInvoiceReceipt(invoice)}>Receipt PDF</Button>
                              {invoice.status !== 'paid' && (
                                <Button size="sm" variant="outline" onClick={() => markInvoicePaid(invoice)}>Mark Paid</Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
