import { useEffect, useState, type FormEvent } from "react";
import {
  CalendarDays,
  History,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import DateInput from "../components/DateInput";
import { useLocalization } from "../contexts/LocalizationContext";
import { formatDate } from "../lib/formatDate";
import {
  membershipApi,
  type MembershipMember,
} from "../lib/membershipApi";
import {
  planManagementApi,
  type MaintenanceList,
} from "../lib/planManagementApi";
import {
  subscriptionsV2Api,
  type SubscriptionV2,
} from "../lib/subscriptionsV2Api";

const copy = {
  en: {
    title: "Multi-user memberships",
    subtitle:
      "Manage holders, beneficiaries, capacity, member exceptions and history.",
    back: "Membership plans",
    refresh: "Refresh",
    subscription: "Subscription",
    select: "Select a subscription",
    capacity: "Capacity",
    occupied: "occupied",
    available: "available",
    add: "Add member",
    member: "Member",
    role: "Role",
    joined: "Joined",
    status: "Status",
    restrictions: "Restrictions",
    actions: "Actions",
    existing: "Existing member",
    createNew: "Create new member",
    memberId: "Member ID",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    phone: "Phone",
    joinedAt: "Join date",
    save: "Add to subscription",
    cancel: "Cancel",
    suspend: "Suspend",
    activate: "Activate",
    remove: "Remove",
    futureBookings: "Future bookings",
    history: "History",
    cancelBookings: "Cancel future bookings",
    keepBookings: "Keep future bookings",
    reviewBookings: "Manual review",
    noMembers: "No members found for this subscription.",
    holder: "Holder",
    beneficiary: "Beneficiary",
    editDates: "Modify dates",
    startDate: "Start date",
    endDate: "End date",
    saveDates: "Save dates",
    invalidDates: "Enter a valid date range.",
    datesUpdated: "Subscription dates updated.",
    loading: "Loading...",
    noSubscriptions: "No multi-user subscriptions were found.",
    searchMember: "Search by name, email, phone or ID",
    search: "Search",
    selected: "Selected",
    contactRequired: "Enter an email address or phone number.",
    memberRequired: "Select an existing member.",
    unableLoadSubscriptions: "Unable to load subscriptions.",
    unableLoadMembers: "Unable to load subscription members.",
    unableAddMember: "Unable to add member.",
    unableUpdateMember: "Unable to update member.",
    unableLoadHistory: "Unable to load history.",
    serverUpdateRequired:
      "This action requires the latest server version. Removing a member remains available.",
    expiry: "Expiry",
    extendExpiry: "Modify expiry",
    mainExpiry: "Main subscription expiry",
    maximumExpiry: "Maximum permitted expiry",
    expiryUpdated: "Beneficiary expiry updated.",
    changeHolder: "Change holder",
    selectNewHolder: "Select the new holder",
    holderChanged: "Subscription holder changed.",
    expiredLocked:
      "This subscription has expired. Its beneficiary list and roles can no longer be modified.",
    noHolderCandidates:
      "There are no active beneficiaries available to become the holder.",
    event: "Event",
  },
  ar: {
    title: "العضويات متعددة المستخدمين",
    subtitle: "إدارة المسؤول والمستفيدين والسعة والاستثناءات وسجل التعديلات.",
    back: "خطط العضوية",
    refresh: "تحديث",
    subscription: "الاشتراك",
    select: "اختر اشتراكاً",
    capacity: "السعة",
    occupied: "مشغولة",
    available: "متاحة",
    add: "إضافة عضو",
    member: "العضو",
    role: "الدور",
    joined: "تاريخ الانضمام",
    status: "الحالة",
    restrictions: "القيود",
    actions: "الإجراءات",
    existing: "عضو موجود",
    createNew: "إنشاء عضو جديد",
    memberId: "معرف العضو",
    firstName: "الاسم",
    lastName: "اسم العائلة",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    joinedAt: "تاريخ الانضمام",
    save: "إضافة إلى الاشتراك",
    cancel: "إلغاء",
    suspend: "تعليق",
    activate: "تفعيل",
    remove: "إزالة",
    futureBookings: "الحجوزات المستقبلية",
    history: "السجل",
    cancelBookings: "إلغاء الحجوزات المستقبلية",
    keepBookings: "الإبقاء على الحجوزات",
    reviewBookings: "مراجعة يدوية",
    noMembers: "لا يوجد أعضاء في هذا الاشتراك.",
    holder: "المسؤول",
    beneficiary: "مستفيد",
    editDates: "تعديل التواريخ",
    startDate: "تاريخ البداية",
    endDate: "تاريخ النهاية",
    saveDates: "حفظ التواريخ",
    invalidDates: "أدخل نطاق تواريخ صالحاً.",
    datesUpdated: "تم تحديث تواريخ الاشتراك.",
    loading: "جارٍ التحميل...",
    noSubscriptions: "لم يتم العثور على اشتراكات متعددة المستخدمين.",
    searchMember: "البحث بالاسم أو البريد أو الهاتف أو المعرّف",
    search: "بحث",
    selected: "تم الاختيار",
    contactRequired: "أدخل البريد الإلكتروني أو رقم الهاتف.",
    memberRequired: "اختر عضواً موجوداً.",
    unableLoadSubscriptions: "تعذر تحميل الاشتراكات.",
    unableLoadMembers: "تعذر تحميل أعضاء الاشتراك.",
    unableAddMember: "تعذر إضافة العضو.",
    unableUpdateMember: "تعذر تحديث العضو.",
    unableLoadHistory: "تعذر تحميل السجل.",
    serverUpdateRequired:
      "يتطلب هذا الإجراء أحدث إصدار من الخادم. لا تزال إزالة العضو متاحة.",
    expiry: "تاريخ الانتهاء",
    extendExpiry: "تعديل تاريخ الانتهاء",
    mainExpiry: "انتهاء الاشتراك الرئيسي",
    maximumExpiry: "أقصى تاريخ انتهاء مسموح",
    expiryUpdated: "تم تحديث تاريخ انتهاء المستفيد.",
    changeHolder: "تغيير المسؤول",
    selectNewHolder: "اختر المسؤول الجديد",
    holderChanged: "تم تغيير مسؤول الاشتراك.",
    expiredLocked:
      "انتهت صلاحية هذا الاشتراك. لا يمكن تعديل قائمة المستفيدين أو أدوارهم.",
    noHolderCandidates:
      "لا يوجد مستفيدون نشطون متاحون لتولي دور المسؤول.",
    event: "الحدث",
  },
} as const;

type AddForm = {
  mode: "existing" | "new";
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  joinedAt: string;
  restrictions: string;
};

const emptyForm: AddForm = {
  mode: "existing",
  memberId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  joinedAt: "",
  restrictions: "",
};

export default function MultiUserMemberships() {
  const { locale } = useLocalization();
  const [searchParams] = useSearchParams();
  const c = locale === "ar" ? copy.ar : copy.en;
  const requestedId = searchParams.get("subscriptionId") || "";
  const requestedMemberId = searchParams.get("memberId") || "";
  const [subscriptions, setSubscriptions] = useState<SubscriptionV2[]>([]);
  const [lists, setLists] = useState<MaintenanceList[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [capacity, setCapacity] = useState({
    maximum: 0,
    occupied: 0,
    available: 0,
  });
  const [history, setHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [dateForm, setDateForm] = useState({ startDate: "", endDate: "" });
  const [form, setForm] = useState<AddForm>(emptyForm);
  const [bookingPolicy, setBookingPolicy] = useState<
    "cancel" | "keep" | "manual_review"
  >("cancel");
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<MembershipMember[]>([]);
  const [managedSubscription, setManagedSubscription] = useState<{
    status: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    planType: string;
    canModifyBeneficiaries: boolean;
  } | null>(null);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [expiryMember, setExpiryMember] = useState<any | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [holderOpen, setHolderOpen] = useState(false);
  const [newHolderMemberId, setNewHolderMemberId] = useState("");

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const [response, listResponse] = await Promise.all([
        subscriptionsV2Api.listSubscriptions({
          status: "all",
          memberId: requestedMemberId || undefined,
        }),
        planManagementApi
          .listMaintenance()
          .catch(() => ({ lists: [] as MaintenanceList[] })),
      ]);
      const multiSubscriptions = response.subscriptions.filter(
        (item) => item.planType !== "individual",
      );
      const multi = await Promise.all(
        multiSubscriptions.map(async (item) => {
          if (item.holderName?.trim()) return item;
          try {
            const holder = await membershipApi.getMember(item.holderMemberId);
            return {
              ...item,
              holderFirstName: holder.member.firstName,
              holderLastName: holder.member.lastName,
              holderName:
                `${holder.member.firstName} ${holder.member.lastName}`.trim(),
            };
          } catch {
            return item;
          }
        }),
      );
      setSubscriptions(multi);
      setLists(listResponse.lists);
      const nextId =
        requestedId && multi.some((item) => item.id === requestedId)
          ? requestedId
          : selectedId && multi.some((item) => item.id === selectedId)
            ? selectedId
            : multi[0]?.id || "";
      setSelectedId(nextId);
      return nextId;
    } catch (error: any) {
      setSubscriptions([]);
      setSelectedId("");
      setMembers([]);
      setCapacity({ maximum: 0, occupied: 0, available: 0 });
      toast.error(error?.message || c.unableLoadSubscriptions);
      return "";
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (subscriptionId = selectedId) => {
    if (!subscriptionId) {
      setMembers([]);
      setCapacity({ maximum: 0, occupied: 0, available: 0 });
      setManagedSubscription(null);
      return;
    }
    setMembersLoading(true);
    try {
      const response =
        await planManagementApi.listSubscriptionMembers(subscriptionId);
      setMembers(response.members as any[]);
      setCapacity(response.capacity);
      setManagedSubscription(response.subscription);
    } catch (error: any) {
      if (error?.status === 404) {
        try {
          const response =
            await subscriptionsV2Api.listSubscriptionMembers(subscriptionId);
          const selected = subscriptions.find(
            (item) => item.id === subscriptionId,
          );
          const occupied = response.members.filter(
            (member) => member.status !== "removed",
          ).length;
          const maximum = selected?.maxMembers || occupied;
          setMembers(response.members as any[]);
          setCapacity({
            maximum,
            occupied,
            available: Math.max(maximum - occupied, 0),
          });
          const today = new Date().toISOString().slice(0, 10);
          setManagedSubscription({
            status: selected?.status || "",
            startDate: selected?.startDate || "",
            endDate: selected?.endDate || "",
            durationDays: 0,
            planType: selected?.planType || "",
            canModifyBeneficiaries: Boolean(
              selected?.status === "active" &&
                selected.endDate &&
                selected.endDate >= today,
            ),
          });
          return;
        } catch (fallbackError: any) {
          error = fallbackError;
        }
      }
      setMembers([]);
      setCapacity({ maximum: 0, occupied: 0, available: 0 });
      setManagedSubscription(null);
      toast.error(error?.message || c.unableLoadMembers);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, []);
  useEffect(() => {
    void loadMembers(selectedId);
  }, [selectedId]);

  const listOptions = (
    key: string,
    fallback: Array<{ code: string; label: string }>,
  ) => {
    const list = lists.find((item) => item.key === key);
    if (!list) return fallback;
    return list.items
      .filter((item) => item.status === "active")
      .map((item) => ({
        code: item.code,
        label: locale === "ar" ? item.labelAr : item.labelEn,
      }));
  };
  const bookingOptions = listOptions("future_booking_policy", [
    { code: "cancel", label: c.cancelBookings },
    { code: "keep", label: c.keepBookings },
    { code: "manual_review", label: c.reviewBookings },
  ]);
  const memberStatusOptions = listOptions("subscription_member_status", []);
  const memberStatusLabel = (status: string) =>
    memberStatusOptions.find((item) => item.code === status)?.label || status;
  const canModifyBeneficiaries = Boolean(
    managedSubscription?.canModifyBeneficiaries,
  );
  const holderCandidates = members.filter(
    (member) =>
      member.role === "beneficiary" && member.status === "active",
  );

  const openDates = () => {
    const selected = subscriptions.find((item) => item.id === selectedId);
    setDateForm({
      startDate: selected?.startDate
        ? String(selected.startDate).slice(0, 10)
        : "",
      endDate: selected?.endDate ? String(selected.endDate).slice(0, 10) : "",
    });
    setDatesOpen(true);
  };

  const updateDates = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !dateForm.startDate ||
      !dateForm.endDate ||
      dateForm.endDate < dateForm.startDate
    ) {
      return toast.error(c.invalidDates);
    }
    try {
      await planManagementApi.updateSubscriptionDates(
        selectedId,
        dateForm.startDate,
        dateForm.endDate,
      );
      setDatesOpen(false);
      await loadSubscriptions();
      await loadMembers(selectedId);
      toast.success(c.datesUpdated);
    } catch (error: any) {
      toast.error(error?.message || c.invalidDates);
    }
  };

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (form.mode === "existing" && !form.memberId) {
      return toast.error(c.memberRequired);
    }
    if (
      form.mode === "new" &&
      (!form.firstName.trim() ||
        !form.lastName.trim() ||
        (!form.email.trim() && !form.phone.trim()))
    ) {
      return toast.error(c.contactRequired);
    }
    setActionBusy(true);
    try {
      try {
        await planManagementApi.addSubscriptionMember(selectedId, {
          memberId: form.mode === "existing" ? form.memberId : undefined,
          newMember:
            form.mode === "new"
              ? {
                  firstName: form.firstName.trim(),
                  lastName: form.lastName.trim(),
                  email: form.email.trim() || undefined,
                  phone: form.phone.trim() || undefined,
                }
              : undefined,
          joinedAt: form.joinedAt || undefined,
          restrictions: { notes: form.restrictions },
        });
      } catch (error: any) {
        if (error?.status !== 404) throw error;

        let memberId = form.memberId;
        if (form.mode === "new") {
          const localEmail = (
            form.email.trim() ||
            `${form.firstName.trim()}.${form.lastName.trim()}.${crypto.randomUUID().slice(0, 8)}@powergym.local`
          )
            .toLowerCase()
            .replace(/\s+/g, ".");
          const created = await membershipApi.createMember({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: localEmail,
            phone: form.phone.trim() || undefined,
            status: "active",
            joinDate:
              form.joinedAt || new Date().toISOString().slice(0, 10),
          });
          memberId = created.member.id;
        }
        await subscriptionsV2Api.addSubscriptionMember(selectedId, {
          memberId,
          role: "beneficiary",
        });
      }
      setAddOpen(false);
      setForm(emptyForm);
      setMemberSearch("");
      setMemberResults([]);
      await loadMembers(selectedId);
      toast.success(c.save);
    } catch (error: any) {
      toast.error(error?.message || c.unableAddMember);
    } finally {
      setActionBusy(false);
    }
  };

  const updateStatus = async (
    member: any,
    status: "active" | "suspended" | "removed",
  ) => {
    setActionBusy(true);
    try {
      try {
        await planManagementApi.updateSubscriptionMember(
          selectedId,
          member.memberId,
          {
            status,
            futureBookingPolicy: bookingPolicy,
            restrictions: member.restrictions || {},
          },
        );
      } catch (error: any) {
        if (error?.status !== 404) throw error;
        if (status !== "removed") {
          throw new Error(c.serverUpdateRequired);
        }
        await subscriptionsV2Api.removeSubscriptionMember(
          selectedId,
          member.memberId,
        );
      }
      await loadMembers(selectedId);
      toast.success(c.status);
    } catch (error: any) {
      toast.error(error?.message || c.unableUpdateMember);
    } finally {
      setActionBusy(false);
    }
  };

  const openExpiry = (member: any) => {
    setExpiryMember(member);
    setExpiryDate(
      member.effectiveEndDate ||
        managedSubscription?.endDate ||
        "",
    );
    setExpiryOpen(true);
  };

  const updateExpiry = async (event: FormEvent) => {
    event.preventDefault();
    if (!expiryMember || !expiryDate) return;
    if (
      expiryMember.maximumEndDate &&
      expiryDate > expiryMember.maximumEndDate
    ) {
      return toast.error(
        `${c.maximumExpiry}: ${expiryMember.maximumEndDate}`,
      );
    }
    setActionBusy(true);
    try {
      await planManagementApi.updateBeneficiaryExpiry(
        selectedId,
        expiryMember.memberId,
        expiryDate,
      );
      setExpiryOpen(false);
      setExpiryMember(null);
      await loadMembers(selectedId);
      toast.success(c.expiryUpdated);
    } catch (error: any) {
      toast.error(error?.message || c.unableUpdateMember);
    } finally {
      setActionBusy(false);
    }
  };

  const changeHolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!newHolderMemberId) return toast.error(c.memberRequired);
    setActionBusy(true);
    try {
      await planManagementApi.changeSubscriptionHolder(
        selectedId,
        newHolderMemberId,
      );
      setHolderOpen(false);
      setNewHolderMemberId("");
      await loadSubscriptions();
      await loadMembers(selectedId);
      toast.success(c.holderChanged);
    } catch (error: any) {
      toast.error(error?.message || c.unableUpdateMember);
    } finally {
      setActionBusy(false);
    }
  };

  const searchExistingMembers = async () => {
    if (!memberSearch.trim()) {
      setMemberResults([]);
      return;
    }
    setActionBusy(true);
    try {
      const response = await membershipApi.listMembers({
        search: memberSearch.trim(),
        status: "active",
      });
      setMemberResults(response.members.slice(0, 8));
    } catch (error: any) {
      toast.error(error?.message || c.unableLoadMembers);
    } finally {
      setActionBusy(false);
    }
  };

  const showHistory = async () => {
    try {
      const response =
        await planManagementApi.getSubscriptionMemberHistory(selectedId);
      setHistory(response.history);
      setHistoryOpen(true);
    } catch (error: any) {
      toast.error(error?.message || c.unableLoadHistory);
    }
  };

  const refreshPage = async () => {
    const nextId = await loadSubscriptions();
    if (nextId) await loadMembers(nextId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{c.title}</h1>
          <p className="text-sm text-slate-500">{c.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/plans">{c.back}</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => void refreshPage()}
            disabled={loading || membersLoading}
          >
            <RefreshCw
              className={`me-2 h-4 w-4 ${loading || membersLoading ? "animate-spin" : ""}`}
            />
            {c.refresh}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{c.subscription}</CardTitle>
          <CardDescription>{c.select}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label>{c.subscription}</Label>
            <select
              className="h-10 w-full rounded-md border bg-white px-3"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loading}
            >
              <option value="">
                {loading
                  ? c.loading
                  : subscriptions.length === 0
                    ? c.noSubscriptions
                    : c.select}
              </option>
              {subscriptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.holderName || item.holderMemberId} — {item.planName}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border px-4 py-2 text-sm">
            <div className="font-medium">
              {c.capacity}: {capacity.occupied}/{capacity.maximum}
            </div>
            <div className="text-slate-500">
              {capacity.available} {c.available}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={openDates}
              disabled={!selectedId || actionBusy}
            >
              <CalendarDays className="me-2 h-4 w-4" />
              {c.editDates}
            </Button>
            <Button
              variant="outline"
              onClick={showHistory}
              disabled={!selectedId || actionBusy}
            >
              <History className="me-2 h-4 w-4" />
              {c.history}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNewHolderMemberId(holderCandidates[0]?.memberId || "");
                setHolderOpen(true);
              }}
              disabled={
                !selectedId ||
                !canModifyBeneficiaries ||
                holderCandidates.length === 0 ||
                actionBusy
              }
            >
              {c.changeHolder}
            </Button>
            <Button
              onClick={() => {
                const selected = subscriptions.find(
                  (item) => item.id === selectedId,
                );
                setForm({
                  ...emptyForm,
                  joinedAt:
                    selected?.startDate?.slice(0, 10) ||
                    new Date().toISOString().slice(0, 10),
                });
                setMemberSearch("");
                setMemberResults([]);
                setAddOpen(true);
              }}
              disabled={
                !selectedId ||
                !canModifyBeneficiaries ||
                capacity.available < 1 ||
                actionBusy
              }
            >
              <Plus className="me-2 h-4 w-4" />
              {c.add}
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedId && managedSubscription && !canModifyBeneficiaries && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {c.expiredLocked}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {c.member}
            </CardTitle>
            <CardDescription>
              {capacity.occupied} {c.occupied} · {capacity.available}{" "}
              {c.available}
            </CardDescription>
          </div>
          <div className="space-y-1">
            <Label>{c.futureBookings}</Label>
            <select
              className="h-9 rounded-md border px-3"
              value={bookingPolicy}
              onChange={(e) => setBookingPolicy(e.target.value as any)}
              disabled={!selectedId || actionBusy}
            >
              {bookingOptions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{c.member}</TableHead>
                <TableHead>{c.role}</TableHead>
                <TableHead>{c.joined}</TableHead>
                <TableHead>{c.expiry}</TableHead>
                <TableHead>{c.status}</TableHead>
                <TableHead>{c.restrictions}</TableHead>
                <TableHead className="text-end">{c.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-slate-500"
                  >
                    {c.loading}
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-slate-500"
                  >
                    {c.noMembers}
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">
                        {member.firstName} {member.lastName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {member.email || member.memberId}
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.role === "holder" ? c.holder : c.beneficiary}
                    </TableCell>
                    <TableCell>
                      {formatDate(member.joinedAt)}
                    </TableCell>
                    <TableCell>
                      <div>
                        {formatDate(
                          member.effectiveEndDate || managedSubscription?.endDate,
                        )}
                      </div>
                      {member.expiryOverride && (
                        <div className="text-xs text-amber-700">
                          {c.maximumExpiry}: {formatDate(member.maximumEndDate)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.status === "active" ? "default" : "secondary"
                        }
                      >
                        {memberStatusLabel(member.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      {member.restrictions?.notes || "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      {member.role !== "holder" && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {["active", "suspended"].includes(member.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openExpiry(member)}
                              disabled={
                                actionBusy || !canModifyBeneficiaries
                              }
                            >
                              {c.extendExpiry}
                            </Button>
                          )}
                          {member.status !== "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(member, "active")}
                              disabled={
                                actionBusy || !canModifyBeneficiaries
                              }
                            >
                              {c.activate}
                            </Button>
                          )}
                          {member.status === "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(member, "suspended")}
                              disabled={
                                actionBusy || !canModifyBeneficiaries
                              }
                            >
                              {c.suspend}
                            </Button>
                          )}
                          {member.status !== "removed" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateStatus(member, "removed")}
                              disabled={
                                actionBusy || !canModifyBeneficiaries
                              }
                            >
                              {c.remove}
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={holderOpen} onOpenChange={setHolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.changeHolder}</DialogTitle>
          </DialogHeader>
          <form onSubmit={changeHolder} className="space-y-4">
            <div className="space-y-2">
              <Label>{c.selectNewHolder}</Label>
              {holderCandidates.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {c.noHolderCandidates}
                </p>
              ) : (
                <select
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={newHolderMemberId}
                  onChange={(event) =>
                    setNewHolderMemberId(event.target.value)
                  }
                  required
                >
                  {holderCandidates.map((member) => (
                    <option key={member.memberId} value={member.memberId}>
                      {member.firstName} {member.lastName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setHolderOpen(false)}
              >
                {c.cancel}
              </Button>
              <Button
                type="submit"
                disabled={
                  actionBusy ||
                  !newHolderMemberId ||
                  !canModifyBeneficiaries
                }
              >
                {c.changeHolder}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={expiryOpen} onOpenChange={setExpiryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.extendExpiry}</DialogTitle>
          </DialogHeader>
          <form onSubmit={updateExpiry} className="space-y-4">
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <div className="font-medium">
                {expiryMember?.firstName} {expiryMember?.lastName}
              </div>
              <div className="mt-1 text-slate-500">
                {c.mainExpiry}: {formatDate(managedSubscription?.endDate)}
              </div>
              <div className="text-slate-500">
                {c.maximumExpiry}: {formatDate(expiryMember?.maximumEndDate)}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{c.expiry}</Label>
              <DateInput
                value={expiryDate}
                onChange={setExpiryDate}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setExpiryOpen(false)}
              >
                {c.cancel}
              </Button>
              <Button
                type="submit"
                disabled={
                  actionBusy ||
                  !expiryDate ||
                  !canModifyBeneficiaries
                }
              >
                {c.saveDates}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.add}</DialogTitle>
          </DialogHeader>
          <form onSubmit={addMember} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={form.mode === "existing" ? "default" : "outline"}
                onClick={() => setForm({ ...form, mode: "existing" })}
              >
                {c.existing}
              </Button>
              <Button
                type="button"
                variant={form.mode === "new" ? "default" : "outline"}
                onClick={() => setForm({ ...form, mode: "new" })}
              >
                {c.createNew}
              </Button>
            </div>
            {form.mode === "existing" ? (
              <div className="space-y-2">
                <Label>{c.existing}</Label>
                <div className="flex gap-2">
                  <Input
                    value={memberSearch}
                    placeholder={c.searchMember}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchExistingMembers();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void searchExistingMembers()}
                    disabled={actionBusy || !memberSearch.trim()}
                  >
                    <Search className="me-2 h-4 w-4" />
                    {c.search}
                  </Button>
                </div>
                {form.memberId && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {c.selected}: {form.memberId}
                  </div>
                )}
                {memberResults.length > 0 && (
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-1">
                    {memberResults.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className={`w-full rounded px-3 py-2 text-start text-sm hover:bg-slate-100 ${
                          form.memberId === member.id ? "bg-slate-100" : ""
                        }`}
                        onClick={() =>
                          setForm({ ...form, memberId: member.id })
                        }
                      >
                        <span className="block font-medium">
                          {member.firstName} {member.lastName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {member.email || member.phone || member.id}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{c.firstName}</Label>
                  <Input
                    value={form.firstName}
                    onChange={(e) =>
                      setForm({ ...form, firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>{c.lastName}</Label>
                  <Input
                    value={form.lastName}
                    onChange={(e) =>
                      setForm({ ...form, lastName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>{c.email}</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder={c.contactRequired}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{c.phone}</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    placeholder={c.contactRequired}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{c.joinedAt}</Label>
              <DateInput
                value={form.joinedAt}
                onChange={(value) => setForm({ ...form, joinedAt: value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{c.restrictions}</Label>
              <Input
                value={form.restrictions}
                onChange={(e) =>
                  setForm({ ...form, restrictions: e.target.value })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                {c.cancel}
              </Button>
              <Button type="submit" disabled={actionBusy}>
                {c.save}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={datesOpen} onOpenChange={setDatesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.editDates}</DialogTitle>
          </DialogHeader>
          <form onSubmit={updateDates} className="space-y-4">
            <div className="space-y-2">
              <Label>{c.startDate}</Label>
              <DateInput
                value={dateForm.startDate}
                onChange={(value) =>
                  setDateForm((current) => ({ ...current, startDate: value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{c.endDate}</Label>
              <DateInput
                value={dateForm.endDate}
                onChange={(value) =>
                  setDateForm((current) => ({ ...current, endDate: value }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDatesOpen(false)}
              >
                {c.cancel}
              </Button>
              <Button type="submit">{c.saveDates}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{c.history}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{c.member}</TableHead>
                <TableHead>{c.event}</TableHead>
                <TableHead>{c.status}</TableHead>
                <TableHead>{c.joined}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.memberId}</TableCell>
                  <TableCell>
                    <div>{item.action || "—"}</div>
                    {Array.isArray(item.details?.beneficiaries) &&
                      item.details.beneficiaries.length > 0 && (
                        <div className="mt-1 max-w-64 text-xs text-slate-500">
                          {item.details.beneficiaries
                            .map((member: any) => member.memberId)
                            .join(", ")}
                        </div>
                      )}
                  </TableCell>
                  <TableCell>
                    {item.previousStatus || "—"} → {item.newStatus || "—"}
                  </TableCell>
                  <TableCell>
                    {item.effectiveAt
                      ? String(item.effectiveAt).slice(0, 19).replace("T", " ")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
