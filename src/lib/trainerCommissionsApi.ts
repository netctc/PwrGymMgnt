export type TrainerCommissionSummary = {
  trainerId: string;
  trainerName: string;
  sessionsCompleted: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  currency: string;
};

export type TrainerCommissionHistory = {
  id: string;
  trainerId: string;
  trainerName: string;
  planName: string;
  planType: string;
  invoiceNumber: string;
  grossAmount: number;
  commissionPercent: number;
  trainerAmount: number;
  gymAmount: number;
  amountPaid: number;
  amountPending: number;
  sessionsContracted: number;
  sessionsConsumed: number;
  sessionsRemaining: number;
  sessionsPaid: number;
  currency: string;
  paymentStatus: "pending" | "earned" | "partially_paid" | "paid";
  dueDate: string | null;
  earnedAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type TrainerCommissionPayment = {
  id: string;
  commissionId: string;
  trainerId: string;
  trainerName: string;
  planName: string;
  invoiceNumber: string;
  paymentType: "partial" | "full";
  amount: number;
  commissionTotal: number;
  balanceBefore: number;
  balanceAfter: number;
  sessionsContracted: number;
  sessionsConsumed: number;
  sessionsPaidBefore: number;
  sessionsPaidAfter: number;
  currency: string;
  authorizedBy: string;
  paidAt: string;
};

export type TrainerCommissionFilters = {
  from?: string;
  to?: string;
  trainerId?: string;
  planType?: string;
  paymentStatus?: string;
};

function query(filters: TrainerCommissionFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

async function download(url: string, filename: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Export failed (${response.status})`);
  }
  const href = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export const trainerCommissionsApi = {
  list: (filters: TrainerCommissionFilters) =>
    request<{
      trainers: TrainerCommissionSummary[];
      history: TrainerCommissionHistory[];
      payments: TrainerCommissionPayment[];
    }>(
      `/api/v2/trainer-commissions?${query(filters)}`,
    ),
  markPaid: (id: string, confirmPendingCustomerPayment = false) =>
    request<{ ok: boolean; paymentStatus: string }>(
      `/api/v2/trainer-commissions/${encodeURIComponent(id)}/pay`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmPendingCustomerPayment }),
      },
    ),
  markPartialPaid: (id: string, confirmPendingCustomerPayment = false) =>
    request<{
      ok: boolean;
      paymentStatus: string;
      amount: number;
      amountPaid: number;
      amountPending: number;
      sessionsConsumed: number;
      sessionsContracted: number;
    }>(
      `/api/v2/trainer-commissions/${encodeURIComponent(id)}/pay-partial`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmPendingCustomerPayment }),
      },
    ),
  exportCsv: (filters: TrainerCommissionFilters) =>
    download(`/api/v2/trainer-commissions/export.csv?${query(filters)}`, "trainer-commissions.csv"),
  exportPdf: (filters: TrainerCommissionFilters) =>
    download(`/api/v2/trainer-commissions/export.pdf?${query(filters)}`, "trainer-commissions.pdf"),
};
