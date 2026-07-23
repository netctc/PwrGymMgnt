import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Link } from 'react-router-dom';
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
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePersistentState } from '../hooks/usePersistentState';
import { useLocalization } from '../contexts/LocalizationContext';

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

function badgeVariant(status?: string) {
  if (status === 'active' || status === 'paid') return 'default';
  if (status === 'archived' || status === 'expired') return 'destructive';
  return 'secondary';
}

export default function Members() {
  const { locale } = useLocalization();
  const multiUserCopy = locale === 'ar'
    ? { create: 'اشتراك جديد متعدد المستخدمين', manage: 'إدارة المستفيدين' }
    : { create: 'New multi-user subscription', manage: 'Manage beneficiaries' };
  const [members, setMembers] = useState<MembershipMember[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [search, setSearch] = usePersistentState('powergym.members.search', '');
  const [statusFilter, setStatusFilter] = usePersistentState('powergym.members.statusFilter', '');
  const [accessFilter, setAccessFilter] = usePersistentState('powergym.members.accessFilter', '');
  const [accessDate, setAccessDate] = usePersistentState('powergym.members.accessDate', today());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMemberForm);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewMember, setRenewMember] = useState<MembershipMember | null>(null);
  const [renewPlanId, setRenewPlanId] = useState('');
  const [renewStartDate, setRenewStartDate] = useState(today());
  const [renewCurrentExpiry, setRenewCurrentExpiry] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrMember, setQrMember] = useState<MembershipMember | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [qrTokenId, setQrTokenId] = useState('');
  const [qrExpiryDate, setQrExpiryDate] = useState('');
  const [qrPlanName, setQrPlanName] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<MembershipMember | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const newMultiUserUrl = (memberId?: string) =>
    `/subscriptions/new-hybrid${memberId ? `?holderMemberId=${encodeURIComponent(memberId)}` : ''}`;
  const manageBeneficiariesUrl = (memberId: string) =>
    `/plans/multi-user?memberId=${encodeURIComponent(memberId)}`;

  const activeCount = useMemo(() => members.filter((member) => member.status === 'active').length, [members]);
  const archivedCount = useMemo(() => members.filter((member) => member.status === 'archived').length, [members]);
  const selectedRenewPlan = useMemo(() => plans.find((plan) => plan.id === renewPlanId) || null, [plans, renewPlanId]);
  const renewEndDate = useMemo(
    () => (renewStartDate && selectedRenewPlan ? addDaysToDate(renewStartDate, selectedRenewPlan.durationDays) : ''),
    [renewStartDate, selectedRenewPlan],
  );

  const loadPlans = async () => {
    try {
      const response = await membershipApi.listPlans();
      setPlans(response.plans.filter((plan) => plan.status === 'active'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to load plans');
    }
  };

  const loadMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await membershipApi.listMembers({
        search,
        status: statusFilter,
        accessedToday: accessFilter === 'today',
        accessDate: accessFilter === 'date' ? accessDate : undefined,
      });
      setMembers(response.members);
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

  const applyFilters = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    loadMembers();
  };

  const openCreate = () => {
    setMemberForm(emptyMemberForm);
    setFormOpen(true);
  };

  const openEdit = (member: MembershipMember) => {
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
        setRenewMember(newMember);
        setRenewPlanId(plans[0]?.id || '');
        setRenewCurrentExpiry('');
        setRenewStartDate(today());
        setRenewOpen(true);
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

  const openRenew = async (member: MembershipMember) => {
    setRenewMember(member);
    setRenewPlanId(plans[0]?.id || '');
    setRenewCurrentExpiry('');
    setRenewStartDate(today());
    setRenewOpen(true);

    try {
      const response = await membershipApi.getMember(member.id);
      const currentExpiry = getLatestSubscriptionEndDate(response.subscriptions);
      setRenewCurrentExpiry(currentExpiry);
      setRenewStartDate(computeRenewalStartDate(currentExpiry));
    } catch (err: any) {
      toast.error(err.message || 'Failed to calculate renewal dates');
    }
  };

  const submitRenewal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renewMember) return;
    setSaving(true);
    try {
      const plan = plans.find((item) => item.id === renewPlanId);
      if (!plan) throw new Error('Select an active plan before renewing.');
      await membershipApi.createSubscription(renewMember.id, {
        planId: plan.id,
        createInvoice: true,
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
    setQrExpiryDate('');
    setQrPlanName('');
    setQrOpen(true);

    try {
      const response = await membershipApi.getMember(member.id);
      const latest = response.subscriptions
        .filter((subscription) => subscription.status === 'active' && subscription.endDate)
        .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0];
      setQrExpiryDate(latest?.endDate ? String(latest.endDate).slice(0, 10) : '');
      setQrPlanName(latest?.planName || member.currentPlan || '');
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
          <Button variant="outline" asChild>
            <Link to={newMultiUserUrl()}><UserPlus className="mr-2 h-4 w-4" />{multiUserCopy.create}</Link>
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
            <CardTitle className="text-2xl">{members.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active Members</CardDescription>
            <CardTitle className="text-2xl">{activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Archived Members</CardDescription>
            <CardTitle className="text-2xl">{archivedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member Directory</CardTitle>
          <CardDescription>Search, create, renew, and issue QR e-cards.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={applyFilters} className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-8"
                placeholder="Search by name, email, or phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {MEMBER_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              value={accessFilter}
              onChange={(event) => setAccessFilter(event.target.value)}
            >
              <option value="">All access dates</option>
              <option value="today">Accessed today</option>
              <option value="date">Accessed on date</option>
            </select>
            {accessFilter === 'date' && (
              <DateInput value={accessDate} onChange={(v) => setAccessDate(v)} />
            )}
            <Button type="submit" disabled={loading}>Apply</Button>
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
                      description="Try clearing the search, status, or access-date filters before creating a new member."
                      actionLabel="Clear filters"
                      onAction={() => { setSearch(''); setStatusFilter(''); setAccessFilter(''); setAccessDate(today()); }}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{member.firstName} {member.lastName}</div>
                      <div className="text-xs text-slate-500">{member.id}</div>
                    </TableCell>
                    <TableCell>
                      <div>{member.email}</div>
                      <div className="text-xs text-slate-500">{member.phone || 'No phone'}</div>
                    </TableCell>
                    <TableCell>{member.currentPlan || '—'}</TableCell>
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
                        <Button variant="destructive" size="sm" onClick={() => setArchiveTarget(member)}><Archive className="mr-1 h-3.5 w-3.5" /> Archive</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{memberForm.id ? 'Edit Member' : 'Create Member'}</DialogTitle></DialogHeader>
          <form onSubmit={submitMember} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" value={memberForm.firstName} onChange={(event) => updateMemberForm('firstName', event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" value={memberForm.lastName} onChange={(event) => updateMemberForm('lastName', event.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={memberForm.email} onChange={(event) => updateMemberForm('email', event.target.value)} placeholder="optional if phone provided" />
                <p className="text-xs text-slate-500">If not provided, auto-generated as firstname.lastname@powergym.local</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={memberForm.phone} onChange={(event) => updateMemberForm('phone', event.target.value)} placeholder="optional if email provided" />
              </div>
            </div>
            <div className={`grid grid-cols-1 gap-4 ${memberForm.id ? 'md:grid-cols-2' : ''}`}>
              <div className="space-y-2">
                <Label htmlFor="joinDate">Join Date</Label>
                <DateInput id="joinDate" value={memberForm.joinDate} onChange={(v) => console.log(v)} />
              </div>
              {memberForm.id && (
                <div className="space-y-2">
                  <Label htmlFor="memberStatus">Status</Label>
                  <select
                    id="memberStatus"
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={memberForm.status}
                    onChange={(event) => updateMemberForm('status', event.target.value)}
                  >
                    {MEMBER_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              {memberForm.id && (
                <>
                  <Button type="button" variant="outline" asChild>
                    <Link to={newMultiUserUrl(memberForm.id)}><UserPlus className="mr-2 h-4 w-4" />{multiUserCopy.create}</Link>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Renew Subscription</DialogTitle></DialogHeader>
          <form onSubmit={submitRenewal} className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{renewMember?.firstName} {renewMember?.lastName}</p>
              <p className="text-slate-500">Current plan: {renewMember?.currentPlan || '—'}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="renewPlan">Plan</Label>
              <select
                id="renewPlan"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={renewPlanId}
                onChange={(event) => setRenewPlanId(event.target.value)}
                required
              >
                {plans.length === 0 && <option value="">No active plans available</option>}
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name} - {formatMoney(plan.price, plan.currency)} / {plan.durationDays} days</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Current Expiry</Label>
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
              <p className="text-xs text-slate-500">End Date is calculated automatically from the renewal start date plus the selected plan duration.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              {renewMember && (
                <>
                  <Button type="button" variant="outline" asChild>
                    <Link to={newMultiUserUrl(renewMember.id)}><UserPlus className="mr-2 h-4 w-4" />{multiUserCopy.create}</Link>
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to={manageBeneficiariesUrl(renewMember.id)}>{multiUserCopy.manage}</Link>
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={() => setRenewOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || plans.length === 0}>{saving ? 'Renewing...' : 'Renew & Invoice'}</Button>
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
            <Button onClick={generateToken} disabled={saving || !qrMember || !qrExpiryDate} className="w-full">
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
                    <div><span className="text-slate-500">Last Access:</span> {formatDate(detail.member.lastAccess)}</div>
                    <div><span className="text-slate-500">Member ID:</span> {detail.member.id}</div>
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={newMultiUserUrl(detail.member.id)}><UserPlus className="mr-2 h-4 w-4" />{multiUserCopy.create}</Link>
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
