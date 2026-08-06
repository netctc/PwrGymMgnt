export type PaymentEventV2 = {
  id: string;
  type: "payment" | "waive" | "refund";
  amount: string;
  effectiveDate: string;
  reason: string;
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
  recordPayment: (invoiceId: string, input: { amountPaid: string; effectiveDate: string; reason?: string }) =>
    request<{ summary: Pick<AccountingInvoiceV2, "total" | "netPaid" | "balanceDue" | "status"> }>(
      `/api/v2/accounting/invoices/${encodeURIComponent(invoiceId)}/payments`,
      { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) },
    ),
};
