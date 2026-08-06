export type PaymentEventV2 = {
  id: string;
  type: "payment" | "waive" | "refund";
  amount: string;
  effectiveDate: string;
  reason: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  performedBy: string;
  createdAt: string;
};

export type AccountingInvoiceV2 = {
  id: string;
  invoiceNumber: string;
  memberId: string;
  memberName: string;
  subscriptionId: string;
  planName: string;
  currency: string;
  dueDate: string;
  total: string;
  netPaid: string;
  balanceDue: string;
  status: "pending" | "partial" | "paid" | "overdue" | "waived" | "refunded";
  events: PaymentEventV2[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Payment operation failed");
  return data;
}

export const paymentsV2Api = {
  listInvoices: () => request<{ invoices: AccountingInvoiceV2[] }>("/api/v2/accounting/invoices"),
  recordPayment: (invoiceId: string, input: { amountPaid: string; effectiveDate: string; paymentMethod: string; reference: string; notes?: string }) =>
    request<{ summary: Pick<AccountingInvoiceV2, "total" | "netPaid" | "balanceDue" | "status"> }>(
      `/api/v2/accounting/invoices/${encodeURIComponent(invoiceId)}/payments`,
      { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) },
    ),
  downloadReceipt: async (paymentEventId: string) => {
    const response = await fetch(`/api/v2/accounting/payments/${encodeURIComponent(paymentEventId)}/receipt`, { credentials: "include" });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Receipt download failed");
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `payment-receipt-${paymentEventId}.html`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  },
  waiveBalance: (invoiceId: string, input: { amount: string; effectiveDate: string; reason: string }) =>
    request<{ summary: Pick<AccountingInvoiceV2, "total" | "netPaid" | "balanceDue" | "status"> }>(
      `/api/v2/accounting/invoices/${encodeURIComponent(invoiceId)}/waivers`,
      { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) },
    ),
  refundPayment: (paymentEventId: string, input: { amount: string; effectiveDate: string; reason: string }) =>
    request<{ summary: Pick<AccountingInvoiceV2, "total" | "netPaid" | "balanceDue" | "status">; entitlementCancelled: boolean }>(
      `/api/v2/accounting/payments/${encodeURIComponent(paymentEventId)}/refunds`,
      { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) },
    ),
};
