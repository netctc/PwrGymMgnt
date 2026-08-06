import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import DateInput from "../DateInput";
import { paymentsV2Api, type AccountingInvoiceV2 } from "../../lib/paymentsV2Api";

function currentDate() { return new Date().toISOString().slice(0, 10); }
function money(value: string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
}
function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default function SubscriptionPaymentsPanel() {
  const [invoices, setInvoices] = useState<AccountingInvoiceV2[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(currentDate());
  const [reason, setReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [reference, setReference] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"waive" | "refund" | "reversal">("waive");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [paymentEventId, setPaymentEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const selected = useMemo(() => invoices.find((invoice) => invoice.id === selectedId) || null, [invoices, selectedId]);

  async function load() {
    const data = await paymentsV2Api.listInvoices();
    setInvoices(data.invoices);
  }
  useEffect(() => { load().catch((error) => toast.error(error.message)); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!(Number(amountPaid) > 0)) return toast.error("Paid amount must be greater than zero");
    setLoading(true);
    try {
      if (!paymentMethod) return toast.error("Select a payment method");
      if (!reference.trim()) return toast.error("Payment reference is required");
      const result = await paymentsV2Api.recordPayment(selected.id, { amountPaid, effectiveDate, paymentMethod, reference, notes: reason });
      toast.success(`Payment recorded. Pending: ${money(result.summary.balanceDue, selected.currency)}`);
      setAmountPaid(""); setReason(""); setReference("");
      await load();
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(false); }
  }

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!(Number(adjustmentAmount) > 0)) return toast.error("Adjustment amount must be greater than zero");
    if (!adjustmentReason.trim()) return toast.error("A reason is required");
    if (adjustmentType !== "waive" && !paymentEventId) return toast.error("Select the original payment");
    setLoading(true);
    try {
      if (adjustmentType === "waive") {
        const result = await paymentsV2Api.waiveBalance(selected.id, {
          amount: adjustmentAmount, effectiveDate, reason: adjustmentReason,
        });
        toast.success(`Balance waived. Pending: ${money(result.summary.balanceDue, selected.currency)}`);
      } else if (adjustmentType === "refund") {
        const result = await paymentsV2Api.refundPayment(paymentEventId, {
          amount: adjustmentAmount, effectiveDate, reason: adjustmentReason,
        });
        toast.success(result.entitlementCancelled ? "Full refund recorded and entitlement cancelled" : "Partial refund recorded");
      } else {
        const result = await paymentsV2Api.reversePayment(paymentEventId, {
          amount: adjustmentAmount, effectiveDate, reason: adjustmentReason,
        });
        toast.success(`Payment reversed. Pending: ${money(result.summary.balanceDue, selected.currency)}`);
      }
      setAdjustmentAmount(""); setAdjustmentReason(""); setPaymentEventId("");
      await load();
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(false); }
  }

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Subscription payments</CardTitle>
      <CardDescription>Record the amount received. The pending balance and payment status are calculated automatically.</CardDescription>
    </CardHeader><CardContent>
      <form className="grid gap-4 md:grid-cols-6" onSubmit={submit}>
        <div className="md:col-span-2"><Label>Invoice / member</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
          <option value="">Select invoice</option>{invoices.filter((invoice) => invoice.balanceDue !== "0.00").map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.memberName} · {invoice.planName}</option>)}
        </select></div>
        <div><Label>Amount paid</Label><Input type="number" min="0.01" step="0.01" max={selected?.balanceDue || undefined} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} required /></div>
        <div><Label>Payment date</Label><DateInput value={effectiveDate} onChange={setEffectiveDate} required /></div>
        <div><Label>Pending amount</Label><Input value={selected ? money(selected.balanceDue, selected.currency) : ""} readOnly /></div>
        <div><Label>Payment method</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required><option value="">Select method</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></div>
        <div className="md:col-span-2"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} required /></div>
        <div className="md:col-span-3"><Label>Notes</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="flex items-end"><Button type="submit" disabled={!selected || loading}>{loading ? "Saving…" : "Record payment"}</Button></div>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Waivers and refunds / reversals</CardTitle>
      <CardDescription>Reversals correct erroneous entries without deleting history. Refunds return money and may cancel entitlement.</CardDescription>
    </CardHeader><CardContent>
      <form className="grid gap-4 md:grid-cols-6" onSubmit={submitAdjustment}>
        <div><Label>Operation</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={adjustmentType} onChange={(e) => { setAdjustmentType(e.target.value as "waive" | "refund" | "reversal"); setPaymentEventId(""); }}>
          <option value="waive">Waive balance</option><option value="refund">Refund payment</option><option value="reversal">Reverse erroneous payment</option>
        </select></div>
        <div className="md:col-span-2"><Label>Invoice / member</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setPaymentEventId(""); }} required>
          <option value="">Select invoice</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.memberName}</option>)}
        </select></div>
        {adjustmentType !== "waive" && <div className="md:col-span-2"><Label>Original payment</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentEventId} onChange={(e) => setPaymentEventId(e.target.value)} required>
          <option value="">Select payment</option>{selected?.events.filter((item) => item.type === "payment").map((item) => <option key={item.id} value={item.id}>{displayDate(item.effectiveDate)} · {money(item.amount, selected.currency)}</option>)}
        </select></div>}
        <div><Label>Amount</Label><Input type="number" min="0.01" step="0.01" max={adjustmentType === "waive" ? selected?.balanceDue || undefined : undefined} value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} required /></div>
        <div><Label>Effective date</Label><DateInput value={effectiveDate} onChange={setEffectiveDate} required /></div>
        <div className="md:col-span-5"><Label>Reason</Label><Input value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} required /></div>
        <div className="flex items-end"><Button type="submit" disabled={!selected || loading}>{loading ? "Saving…" : adjustmentType === "waive" ? "Waive balance" : adjustmentType === "refund" ? "Record refund" : "Reverse payment"}</Button></div>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Receivables</CardTitle><CardDescription>Total, collected and pending amounts derived from the payment ledger.</CardDescription></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Member</TableHead><TableHead>Plan</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Pending</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{invoices.map((invoice) => <TableRow key={invoice.id}><TableCell>{invoice.invoiceNumber}</TableCell><TableCell>{invoice.memberName}</TableCell><TableCell>{invoice.planName}</TableCell><TableCell>{money(invoice.total, invoice.currency)}</TableCell><TableCell>{money(invoice.netPaid, invoice.currency)}</TableCell><TableCell>{money(invoice.balanceDue, invoice.currency)}</TableCell><TableCell>{displayDate(invoice.dueDate)}</TableCell><TableCell>{invoice.status}</TableCell></TableRow>)}</TableBody>
      </Table>
      {selected && selected.events.length > 0 && <div className="mt-6"><h3 className="mb-2 text-sm font-medium">Adjustment history</h3>
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Method / reference</TableHead><TableHead>Reason / notes</TableHead><TableHead>Performed by</TableHead><TableHead>Receipt</TableHead></TableRow></TableHeader>
          <TableBody>{selected.events.map((item) => <TableRow key={item.id}><TableCell>{displayDate(item.effectiveDate)}</TableCell><TableCell className="capitalize">{item.type}</TableCell><TableCell>{money(item.amount, selected.currency)}</TableCell><TableCell>{item.type === "payment" ? `${item.paymentMethod} · ${item.reference}` : "—"}</TableCell><TableCell>{item.notes || item.reason}</TableCell><TableCell>{item.performedBy}</TableCell><TableCell>{item.type === "payment" ? <Button type="button" variant="outline" size="sm" onClick={() => paymentsV2Api.downloadReceipt(item.id).catch((error) => toast.error(error.message))}>Download</Button> : "—"}</TableCell></TableRow>)}</TableBody>
        </Table></div>}
    </CardContent></Card>
  </div>;
}
