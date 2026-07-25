export type MembershipPlan = {
  id: string;
  name: string;
  description?: string;
  durationDays: number;
  price: number;
  currency: string;
  status: string;
};

export type MembershipMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status: string;
  joinDate?: string | null;
  currentPlan?: string | null;
  currentExpiry?: string | null;
  lastAccess?: string | null;
  subscriptionType?: 'individual' | 'multi_user' | 'none';
  multiUserRole?: 'holder' | 'beneficiary' | null;
  multiUserPlanType?: 'family' | 'group' | 'corporate' | null;
  multiUserSubscriptionId?: string | null;
  multiUserSubscriptionStatus?: string | null;
  multiUserSubscriptionEndDate?: string | null;
  legacySubscriptionId?: string | null;
  paymentInvoiceId?: string | null;
  paymentDueDate?: string | null;
  holderActionLocked?: boolean;
  planDescription?: string | null;
  multiUserMembers?: Array<{
    memberId: string;
    name: string;
    role: string;
  }>;
  multiUserCapacity?: {
    maximum: number;
    occupied: number;
    available: number;
  } | null;
  paymentStatus?: string | null;
  paymentAttentionRequired?: boolean;
};

export type MembershipSubscription = {
  id: string;
  memberId: string;
  planId?: string | null;
  planName: string;
  status: string;
  startDate: string;
  endDate: string;
  price: number;
  currency: string;
  data?: Record<string, any> | null;
};

export type MembershipInvoice = {
  id: string;
  invoiceNumber: string;
  memberId: string;
  subscriptionId?: string | null;
  status: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  data?: Record<string, any> | null;
};

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
    const error = new Error(
      payload.error || `Request failed with ${response.status}`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}


async function pdfBlob(url: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);
  let body = options.body as BodyInit | null | undefined;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(url, { credentials: 'include', ...options, headers, body });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/pdf')) {
    const message = contentType.includes('application/json') ? ((await response.json().catch(() => ({}))) as any).error : await response.text().catch(() => '');
    throw new Error(message || `PDF request failed with ${response.status}`);
  }
  return response.blob();
}

async function downloadBlob(url: string, fileName: string, options: ApiOptions = {}) {
  const blob = await pdfBlob(url, options);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  return blob;
}

async function apiRequestAllowing501<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body as BodyInit | null | undefined;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(url, { credentials: 'include', ...options, headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((payload as any).error || `Request failed with ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export const membershipApi = {
  listPlans: () => apiRequest<{ plans: MembershipPlan[] }>('/api/membership/plans'),

  createPlan: (plan: Partial<MembershipPlan>) =>
    apiRequest<{ plan: MembershipPlan }>('/api/membership/plans', { method: 'POST', body: plan }),

  updatePlan: (id: string, plan: Partial<MembershipPlan>) =>
    apiRequest<{ plan: MembershipPlan }>(`/api/membership/plans/${encodeURIComponent(id)}`, { method: 'PUT', body: plan }),

  listMembers: (params: {
    search?: string;
    status?: string;
    accessedToday?: boolean;
    accessDate?: string;
    currentPlan?: string;
    paymentStatus?: string;
    expiryDate?: string;
    sortBy?: string;
    page?: number;
    pageSize?: number;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.accessedToday) query.set('accessedToday', 'true');
    if (params.accessDate) query.set('accessDate', params.accessDate);
    if (params.currentPlan) query.set('currentPlan', params.currentPlan);
    if (params.paymentStatus) query.set('paymentStatus', params.paymentStatus);
    if (params.expiryDate) query.set('expiryDate', params.expiryDate);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    const suffix = query.toString() ? `?${query}` : '';
    return apiRequest<{
      members: MembershipMember[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
      summary: {
        total: number;
        active: number;
        archived: number;
      };
      filterOptions: {
        currentPlans: string[];
      };
    }>(`/api/membership/members${suffix}`);
  },

  createMember: (member: Partial<MembershipMember>) =>
    apiRequest<{ member: MembershipMember }>('/api/membership/members', { method: 'POST', body: member }),

  updateMember: (id: string, member: Partial<MembershipMember>) =>
    apiRequest<{ member: MembershipMember }>(`/api/membership/members/${encodeURIComponent(id)}`, { method: 'PUT', body: member }),

  archiveMember: (id: string) =>
    apiRequest<{ success: boolean; status: string }>(`/api/membership/members/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getMember: (id: string) =>
    apiRequest<{
      member: MembershipMember;
      subscriptions: MembershipSubscription[];
      invoices: MembershipInvoice[];
    }>(`/api/membership/members/${encodeURIComponent(id)}`),

  createSubscription: (
    memberId: string,
    subscription: {
      planId?: string;
      planName?: string;
      startDate?: string;
      endDate?: string;
      durationDays?: number;
      price?: number;
      currency?: string;
      createInvoice?: boolean;
      paymentStatus: 'paid' | 'pending';
      paymentDate: string;
    },
  ) =>
    apiRequest<{ subscription: MembershipSubscription; invoice: MembershipInvoice | null }>(
      `/api/membership/members/${encodeURIComponent(memberId)}/subscriptions`,
      { method: 'POST', body: subscription },
    ),

  updateSubscriptionPaymentStatus: (
    subscriptionId: string,
    payload: { paymentStatus: 'paid' | 'pending'; paymentDate?: string },
  ) =>
    apiRequest<{
      paymentStatus: string;
      paymentStatusLocked: boolean;
      invoice: MembershipInvoice;
    }>(
      `/api/membership/subscriptions/${encodeURIComponent(subscriptionId)}/payment-status`,
      { method: 'PATCH', body: payload },
    ),

  generateAccessToken: (memberId: string) =>
    apiRequest<{ token: string; tokenId: string; memberId: string; expiresAt: string | null; expiryDate?: string | null; planName?: string | null }>(
      `/api/membership/members/${encodeURIComponent(memberId)}/access-token`,
      { method: 'POST', body: {} },
    ),

  downloadEcardPdf: (memberId: string, payload: { token: string; tokenId: string; qrImageData: string; fileName?: string }) =>
    downloadBlob(`/api/membership/members/${encodeURIComponent(memberId)}/ecard/pdf`, payload.fileName || 'PowerGym_QR_eCard.pdf', { method: 'POST', body: payload }),

  getEcardPdfBlob: (memberId: string, payload: { token: string; tokenId: string; qrImageData: string }) =>
    pdfBlob(`/api/membership/members/${encodeURIComponent(memberId)}/ecard/pdf`, { method: 'POST', body: payload }),

  deliverEcardPdf: (
    memberId: string,
    payload: { channel: 'email' | 'whatsapp'; token: string; tokenId: string; qrImageData: string; email?: string; phone?: string },
  ) =>
    apiRequestAllowing501<{ success: boolean; channel: string; recipient: string; fileName: string }>(
      `/api/membership/members/${encodeURIComponent(memberId)}/ecard/deliver`,
      { method: 'POST', body: payload },
    ),

  validateAccess: (token: string) =>
    apiRequest<{ valid: boolean; reason?: string; member?: MembershipMember; subscription?: MembershipSubscription }>(
      '/api/membership/validate-access',
      { method: 'POST', body: { token } },
    ),

  listInvoices: (params: { status?: string; memberId?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.memberId) query.set('memberId', params.memberId);
    const suffix = query.toString() ? `?${query}` : '';
    return apiRequest<{ invoices: MembershipInvoice[] }>(`/api/membership/invoices${suffix}`);
  },

  markInvoicePaid: (id: string) =>
    apiRequest<{ invoice: MembershipInvoice }>(`/api/membership/invoices/${encodeURIComponent(id)}/mark-paid`, {
      method: 'POST',
    }),

  downloadInvoiceReceipt: (id: string, invoiceNumber?: string) =>
    downloadBlob(
      `/api/membership/invoices/${encodeURIComponent(id)}/receipt.pdf`,
      `PowerGym_Receipt_${String(invoiceNumber || id).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`,
    ),
};
