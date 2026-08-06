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
      const result = await paymentsV2Api.recordPayment(selected.id, { amountPaid, effectiveDate, reason });
      toast.success(`Payment recorded. Pending: ${money(result.summary.balanceDue, selected.currency)}`);
      setAmountPaid(""); setReason("");
      await load();
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(false); }
  }

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Subscription payments</CardTitle>
      <CardDescription>Record the amount received. The pending balance and payment status are calculated automatically.</CardDescription>
    </CardHeader><CardContent>
      <form className="grid gap-4 md:grid-cols-5" onSubmit={submit}>
        <div className="md:col-span-2"><Label>Invoice / member</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
          <option value="">Select invoice</option>{invoices.filter((invoice) => invoice.balanceDue !== "0.00").map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.memberName} · {invoice.planName}</option>)}
        </select></div>
        <div><Label>Amount paid</Label><Input type="number" min="0.01" step="0.01" max={selected?.balanceDue || undefined} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} required /></div>
        <div><Label>Payment date</Label><DateInput value={effectiveDate} onChange={setEffectiveDate} required /></div>
        <div><Label>Pending amount</Label><Input value={selected ? money(selected.balanceDue, selected.currency) : ""} readOnly /></div>
        <div className="md:col-span-4"><Label>Reference / note</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="flex items-end"><Button type="submit" disabled={!selected || loading}>{loading ? "Saving…" : "Record payment"}</Button></div>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Receivables</CardTitle><CardDescription>Total, collected and pending amounts derived from the payment ledger.</CardDescription></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Member</TableHead><TableHead>Plan</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Pending</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{invoices.map((invoice) => <TableRow key={invoice.id}><TableCell>{invoice.invoiceNumber}</TableCell><TableCell>{invoice.memberName}</TableCell><TableCell>{invoice.planName}</TableCell><TableCell>{money(invoice.total, invoice.currency)}</TableCell><TableCell>{money(invoice.netPaid, invoice.currency)}</TableCell><TableCell>{money(invoice.balanceDue, invoice.currency)}</TableCell><TableCell>{displayDate(invoice.dueDate)}</TableCell><TableCell>{invoice.status}</TableCell></TableRow>)}</TableBody>
      </Table>
    </CardContent></Card>
  </div>;
}
