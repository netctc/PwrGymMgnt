import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import DateInput from "../components/DateInput";
import EmptyState from "../components/EmptyState";
import InlineAlert from "../components/InlineAlert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useLocalization } from "../contexts/LocalizationContext";
import {
  trainerCommissionsApi,
  type TrainerCommissionFilters,
  type TrainerCommissionHistory,
  type TrainerCommissionPayment,
  type TrainerCommissionSummary,
} from "../lib/trainerCommissionsApi";

const copy = {
  en: {
    title: "Trainer commissions",
    subtitle: "Plan-based earnings, completed sessions and settlement history. Fixed monthly salary remains separate.",
    from: "From", to: "To", trainer: "Trainer", allTrainers: "All trainers",
    planType: "Plan type", allTypes: "All plan types", paymentStatus: "Payment status",
    allStatuses: "All statuses", apply: "Apply filters", refresh: "Refresh", csv: "CSV", pdf: "PDF",
    performance: "Trainer performance", history: "Commission history",
    sessions: "Sessions completed", total: "Commission earned", pending: "Pending settlement", paid: "Paid",
    plan: "Plan", invoice: "Invoice", gross: "Gross fee", percentage: "Share", commission: "Trainer commission",
    gym: "Gym share", status: "Status", due: "Due date", earned: "Earned", settled: "Settled", actions: "Actions",
    amountPaid: "Amount paid", amountPending: "Amount pending", sessionProgress: "Consumed / remaining (contracted)",
    markPaid: "Mark paid", partialPaid: "Partial paid", partiallyPaidStatus: "Partially paid",
    paymentHistory: "Payment history", paymentType: "Payment type", amount: "Amount",
    balance: "Pending balance", authorizedBy: "Authorized by", paidAt: "Payment date",
    partialType: "Partial", fullType: "Full",
    none: "No commissions found", noneDescription: "No plan commission matches the current filters.",
    noPayments: "No commission payments have been recorded.",
    loadError: "Unable to load trainer commissions.",
    pendingInvoice: "Pending customer payment", earnedStatus: "Earned / payable", paidStatus: "Paid to trainer",
    partialSuccess: "The proportional commission for consumed sessions was paid.",
    pendingPaymentWarning: "Warning: the customer has not paid this subscription. You are authorizing a trainer commission payment under your responsibility before collecting from the customer. Continue?",
  },
  ar: {
    title: "عمولات المدربين",
    subtitle: "أرباح الخطط والجلسات المنجزة وسجل التسوية. يبقى الراتب الشهري الثابت منفصلاً.",
    from: "من", to: "إلى", trainer: "المدرب", allTrainers: "كل المدربين",
    planType: "نوع الخطة", allTypes: "كل أنواع الخطط", paymentStatus: "حالة الدفع",
    allStatuses: "كل الحالات", apply: "تطبيق المرشحات", refresh: "تحديث", csv: "CSV", pdf: "PDF",
    performance: "أداء المدربين", history: "سجل العمولات",
    sessions: "الجلسات المنجزة", total: "العمولة المستحقة", pending: "قيد التسوية", paid: "مدفوع",
    plan: "الخطة", invoice: "الفاتورة", gross: "القيمة الإجمالية", percentage: "النسبة", commission: "عمولة المدرب",
    gym: "حصة النادي", status: "الحالة", due: "تاريخ الاستحقاق", earned: "تاريخ الاستحقاق", settled: "تاريخ التسوية", actions: "الإجراءات",
    amountPaid: "المبلغ المدفوع", amountPending: "الرصيد المتبقي", sessionProgress: "المستهلكة / المتبقية (المتعاقد عليها)",
    markPaid: "دفع كامل", partialPaid: "دفع جزئي", partiallyPaidStatus: "مدفوع جزئياً",
    paymentHistory: "سجل المدفوعات", paymentType: "نوع الدفع", amount: "المبلغ",
    balance: "الرصيد المتبقي", authorizedBy: "المعتمد من", paidAt: "تاريخ الدفع",
    partialType: "جزئي", fullType: "كامل",
    none: "لا توجد عمولات", noneDescription: "لا توجد عمولات خطط مطابقة للمرشحات الحالية.",
    noPayments: "لم يتم تسجيل مدفوعات عمولة.",
    loadError: "تعذر تحميل عمولات المدربين.",
    pendingInvoice: "بانتظار دفع العميل", earnedStatus: "مستحقة / واجبة الدفع", paidStatus: "مدفوعة للمدرب",
    partialSuccess: "تم دفع العمولة النسبية للجلسات المستهلكة.",
    pendingPaymentWarning: "تحذير: لم يدفع العميل قيمة هذا الاشتراك بعد. أنت توافق على دفع عمولة المدرب على مسؤوليتك قبل تحصيل المبلغ من العميل. هل تريد المتابعة؟",
  },
} as const;

const planTypes = ["individual", "family", "group", "corporate"];

export default function TrainerCommissions() {
  const { locale, formatCurrency, formatDateTime } = useLocalization();
  const c = locale === "ar" ? copy.ar : copy.en;
  const [filters, setFilters] = useState<TrainerCommissionFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<TrainerCommissionFilters>({});
  const [trainers, setTrainers] = useState<TrainerCommissionSummary[]>([]);
  const [history, setHistory] = useState<TrainerCommissionHistory[]>([]);
  const [payments, setPayments] = useState<TrainerCommissionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await trainerCommissionsApi.list(appliedFilters);
      setTrainers(response.trainers);
      setHistory(response.history);
      setPayments(response.payments);
    } catch (loadError: any) {
      setError(loadError?.message || c.loadError);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => { void load(); }, [load]);

  const trainerOptions = useMemo(() => {
    const values = new Map<string, string>();
    history.forEach((item) => values.set(item.trainerId, item.trainerName));
    trainers.forEach((item) => values.set(item.trainerId, item.trainerName));
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [history, trainers]);

  const statusLabel = (status: string) =>
    status === "paid"
      ? c.paidStatus
      : status === "partially_paid"
        ? c.partiallyPaidStatus
        : status === "earned"
          ? c.earnedStatus
          : c.pendingInvoice;

  const confirmPendingPaymentOverride = (item: TrainerCommissionHistory) =>
    item.paymentStatus !== "pending" || window.confirm(c.pendingPaymentWarning);

  const markPaid = async (item: TrainerCommissionHistory) => {
    if (!confirmPendingPaymentOverride(item)) return;
    try {
      await trainerCommissionsApi.markPaid(item.id, item.paymentStatus === "pending");
      toast.success(c.paidStatus);
      await load();
    } catch (payError: any) {
      toast.error(payError?.message || c.loadError);
    }
  };

  const markPartialPaid = async (item: TrainerCommissionHistory) => {
    if (!confirmPendingPaymentOverride(item)) return;
    try {
      await trainerCommissionsApi.markPartialPaid(item.id, item.paymentStatus === "pending");
      toast.success(c.partialSuccess);
      await load();
    } catch (payError: any) {
      toast.error(payError?.message || c.loadError);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{c.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{c.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => trainerCommissionsApi.exportCsv(appliedFilters).catch((e) => toast.error(e.message))}><Download className="me-2 h-4 w-4" />{c.csv}</Button>
          <Button variant="outline" onClick={() => trainerCommissionsApi.exportPdf(appliedFilters).catch((e) => toast.error(e.message))}><Download className="me-2 h-4 w-4" />{c.pdf}</Button>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="me-2 h-4 w-4" />{c.refresh}</Button>
        </div>
      </div>

      {error && <InlineAlert title={c.loadError} variant="warning">{error}</InlineAlert>}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2"><Label>{c.from}</Label><DateInput value={filters.from || ""} onChange={(value) => setFilters((current) => ({ ...current, from: value }))} /></div>
          <div className="space-y-2"><Label>{c.to}</Label><DateInput value={filters.to || ""} onChange={(value) => setFilters((current) => ({ ...current, to: value }))} /></div>
          <div className="space-y-2"><Label>{c.trainer}</Label><select className="h-9 w-full rounded-md border bg-white px-3" value={filters.trainerId || ""} onChange={(e) => setFilters((current) => ({ ...current, trainerId: e.target.value }))}><option value="">{c.allTrainers}</option>{trainerOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="space-y-2"><Label>{c.planType}</Label><select className="h-9 w-full rounded-md border bg-white px-3" value={filters.planType || ""} onChange={(e) => setFilters((current) => ({ ...current, planType: e.target.value }))}><option value="">{c.allTypes}</option>{planTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="space-y-2"><Label>{c.paymentStatus}</Label><select className="h-9 w-full rounded-md border bg-white px-3" value={filters.paymentStatus || ""} onChange={(e) => setFilters((current) => ({ ...current, paymentStatus: e.target.value }))}><option value="">{c.allStatuses}</option><option value="pending">{c.pendingInvoice}</option><option value="earned">{c.earnedStatus}</option><option value="partially_paid">{c.partiallyPaidStatus}</option><option value="paid">{c.paidStatus}</option></select></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => setAppliedFilters({ ...filters })}>{c.apply}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{c.performance}</CardTitle><CardDescription>{c.subtitle}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>{c.trainer}</TableHead><TableHead>{c.sessions}</TableHead><TableHead>{c.total}</TableHead><TableHead>{c.pending}</TableHead><TableHead>{c.paid}</TableHead></TableRow></TableHeader>
            <TableBody>
              {trainers.map((item) => <TableRow key={item.trainerId}><TableCell className="font-medium">{item.trainerName}</TableCell><TableCell>{item.sessionsCompleted}</TableCell><TableCell>{formatCurrency(item.totalCommission, item.currency)}</TableCell><TableCell>{formatCurrency(item.pendingCommission, item.currency)}</TableCell><TableCell>{formatCurrency(item.paidCommission, item.currency)}</TableCell></TableRow>)}
              {!loading && trainers.length === 0 && <TableRow><TableCell colSpan={5}><EmptyState compact title={c.none} description={c.noneDescription} /></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{c.history}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{c.trainer}</TableHead><TableHead>{c.plan}</TableHead><TableHead>{c.invoice}</TableHead><TableHead>{c.gross}</TableHead><TableHead>{c.percentage}</TableHead><TableHead>{c.commission}</TableHead><TableHead>{c.amountPaid}</TableHead><TableHead>{c.amountPending}</TableHead><TableHead>{c.sessionProgress}</TableHead><TableHead>{c.gym}</TableHead><TableHead>{c.status}</TableHead><TableHead>{c.due}</TableHead><TableHead>{c.actions}</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.map((item) => {
                const payable = item.paymentStatus === "pending" || item.paymentStatus === "earned" || item.paymentStatus === "partially_paid";
                const canPayPartial = payable
                  && item.sessionsContracted > 0
                  && item.sessionsConsumed > item.sessionsPaid
                  && item.amountPending > 0;
                return <TableRow key={item.id}><TableCell>{item.trainerName}</TableCell><TableCell><div className="font-medium">{item.planName}</div><div className="text-xs text-slate-500">{item.planType}</div></TableCell><TableCell>{item.invoiceNumber}</TableCell><TableCell>{formatCurrency(item.grossAmount, item.currency)}</TableCell><TableCell>{item.commissionPercent}%</TableCell><TableCell>{formatCurrency(item.trainerAmount, item.currency)}</TableCell><TableCell>{formatCurrency(item.amountPaid, item.currency)}</TableCell><TableCell>{formatCurrency(item.amountPending, item.currency)}</TableCell><TableCell>{item.sessionsContracted > 0 ? `${item.sessionsConsumed} / ${item.sessionsRemaining} (${item.sessionsContracted})` : "—"}</TableCell><TableCell>{formatCurrency(item.gymAmount, item.currency)}</TableCell><TableCell><Badge variant={item.paymentStatus === "paid" ? "default" : "secondary"}>{statusLabel(item.paymentStatus)}</Badge></TableCell><TableCell>{item.dueDate ? formatDateTime(item.dueDate) : "—"}</TableCell><TableCell><div className="flex min-w-max gap-2">{payable ? <Button size="sm" onClick={() => markPaid(item)}>{c.markPaid}</Button> : null}{payable ? <Button size="sm" variant="outline" disabled={!canPayPartial} onClick={() => markPartialPaid(item)}>{c.partialPaid}</Button> : null}{!payable ? "—" : null}</div></TableCell></TableRow>;
              })}
              {!loading && history.length === 0 && <TableRow><TableCell colSpan={13}><EmptyState compact title={c.none} description={c.noneDescription} /></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{c.paymentHistory}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{c.paidAt}</TableHead><TableHead>{c.trainer}</TableHead><TableHead>{c.plan}</TableHead><TableHead>{c.invoice}</TableHead><TableHead>{c.paymentType}</TableHead><TableHead>{c.amount}</TableHead><TableHead>{c.sessionProgress}</TableHead><TableHead>{c.balance}</TableHead><TableHead>{c.authorizedBy}</TableHead></TableRow></TableHeader>
            <TableBody>
              {payments.map((payment) => <TableRow key={payment.id}><TableCell>{formatDateTime(payment.paidAt)}</TableCell><TableCell>{payment.trainerName}</TableCell><TableCell>{payment.planName}</TableCell><TableCell>{payment.invoiceNumber}</TableCell><TableCell><Badge variant="outline">{payment.paymentType === "partial" ? c.partialType : c.fullType}</Badge></TableCell><TableCell>{formatCurrency(payment.amount, payment.currency)}</TableCell><TableCell>{payment.sessionsContracted > 0 ? `${payment.sessionsConsumed} / ${Math.max(0, payment.sessionsContracted - payment.sessionsConsumed)} (${payment.sessionsContracted})` : "—"}</TableCell><TableCell>{formatCurrency(payment.balanceAfter, payment.currency)}</TableCell><TableCell>{payment.authorizedBy}</TableCell></TableRow>)}
              {!loading && payments.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">{c.noPayments}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
