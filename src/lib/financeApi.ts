export type FinanceTransaction = {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  amount: number;
  date: string;
  source?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  status: string;
  attachmentUrl?: string;
  createdBy?: string;
  approvedBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FinanceSummary = {
  from: string;
  to: string;
  totals: {
    income: number;
    expense: number;
    net: number;
    transactionCount: number;
    activeLoans: number;
    activeLoanCount: number;
    monthlyRentals: number;
    activeRentalCount: number;
  };
  byCategory: Array<{ category: string; type: string; total: number }>;
  byMonth: Array<{ month: string; income: number; expense: number; net: number }>;
};

export type FinanceLoan = {
  id: string;
  lenderName: string;
  principalAmount: number;
  interestRate: number;
  monthlyPayment: number;
  startDate?: string;
  endDate?: string;
  status: string;
  notes?: string;
};

export type FinanceRental = {
  id: string;
  name: string;
  monthlyCost: number;
  dueDay: number;
  startDate?: string;
  endDate?: string;
  landlordInfo?: string;
  status: string;
  notes?: string;
};

export type FinanceBudget = {
  id: string;
  category: string;
  month: string;
  monthlyTarget: number;
  actualAmount: number;
  variance: number;
};

export class FinanceApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'FinanceApiError';
    this.status = status;
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: BodyInit | Record<string, unknown> | null };

async function apiRequest<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body as BodyInit | null | undefined;

  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new FinanceApiError(payload.error || payload?.error?.message || `Request failed with ${response.status}`, response.status);
  }
  return payload as T;
}

function toQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export const financeApi = {
  getSummary: (params: { from?: string; to?: string } = {}) =>
    apiRequest<FinanceSummary>(`/api/finance/summary${toQuery(params)}`),

  listTransactions: (params: { from?: string; to?: string; type?: string; category?: string; status?: string; minAmount?: string | number; maxAmount?: string | number; exactAmount?: string | number } = {}) =>
    apiRequest<{ transactions: FinanceTransaction[] }>(`/api/finance/transactions${toQuery(params)}`),

  createTransaction: (payload: Partial<FinanceTransaction>) =>
    apiRequest<{ transaction: FinanceTransaction }>('/api/finance/transactions', { method: 'POST', body: payload }),

  updateTransaction: (id: string, payload: Partial<FinanceTransaction>) =>
    apiRequest<{ transaction: FinanceTransaction }>(`/api/finance/transactions/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  approveTransaction: (id: string) =>
    apiRequest<{ transaction: FinanceTransaction }>(`/api/finance/transactions/${encodeURIComponent(id)}/approve`, { method: 'POST' }),

  deleteTransaction: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/finance/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listLoans: () => apiRequest<{ loans: FinanceLoan[] }>('/api/finance/loans'),

  createLoan: (payload: Partial<FinanceLoan>) =>
    apiRequest<{ loan: FinanceLoan }>('/api/finance/loans', { method: 'POST', body: payload }),

  updateLoan: (id: string, payload: Partial<FinanceLoan>) =>
    apiRequest<{ loan: FinanceLoan }>(`/api/finance/loans/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  listRentals: () => apiRequest<{ rentals: FinanceRental[] }>('/api/finance/rentals'),

  createRental: (payload: Partial<FinanceRental>) =>
    apiRequest<{ rental: FinanceRental }>('/api/finance/rentals', { method: 'POST', body: payload }),

  updateRental: (id: string, payload: Partial<FinanceRental>) =>
    apiRequest<{ rental: FinanceRental }>(`/api/finance/rentals/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),

  listBudgets: (month?: string) =>
    apiRequest<{ budgets: FinanceBudget[] }>(`/api/finance/budgets${toQuery({ month })}`),

  createBudget: (payload: { category: string; month: string; monthlyTarget: number }) =>
    apiRequest<{ budget: FinanceBudget }>('/api/finance/budgets', { method: 'POST', body: payload }),

  postPayrollRun: (id: string, date?: string) =>
    apiRequest<{ transaction: FinanceTransaction; alreadyPosted: boolean }>(`/api/finance/payroll-runs/${encodeURIComponent(id)}/post`, { method: 'POST', body: { date } }),

  listPayrollPostings: () => apiRequest<{ transactions: FinanceTransaction[] }>('/api/finance/payroll-postings'),

  processRecurring: (payload: { month?: string; dayOfMonth?: number } = {}) =>
    apiRequest<{ processedCount: number; transactions: FinanceTransaction[] }>('/api/finance/recurring/process', { method: 'POST', body: payload }),
};
