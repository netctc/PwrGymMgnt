export type LocalizedListItem = {
  id: string;
  code: string;
  labelEn: string;
  labelAr: string;
  sortOrder: number;
  status: string;
  isSystem: boolean;
  metadata: Record<string, unknown>;
};

export type MaintenanceList = {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  status: string;
  items: LocalizedListItem[];
};

export type ManagedPlan = {
  id: string;
  planVersionId: string;
  versionNumber: number;
  name: string;
  description: string;
  planType: string;
  price: number;
  currency: string;
  durationDays: number;
  validFrom: string | null;
  validTo: string | null;
  maxMembers: number;
  sessionsUnlimited: boolean;
  sessionsPerCycle: number | null;
  cycleFrequency: string;
  distributionModel: string;
  sharedBenefits: boolean;
  futureBookingPolicy: string;
  benefits: Record<string, unknown>;
  restrictions: Record<string, unknown>;
  status: string;
};

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { credentials: 'include', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export const planManagementApi = {
  listPlans: () => request<{ plans: ManagedPlan[] }>('/api/v2/plan-management/plans'),
  createPlan: (payload: Partial<ManagedPlan>) =>
    request<{ plan: ManagedPlan }>('/api/v2/plan-management/plans', { method: 'POST', body: JSON.stringify(payload) }),
  updatePlan: (id: string, payload: Partial<ManagedPlan>) =>
    request<{ plan: ManagedPlan }>(`/api/v2/plan-management/plans/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  listMaintenance: () => request<{ lists: MaintenanceList[] }>('/api/v2/list-maintenance'),
  addListItem: (listId: string, payload: Partial<LocalizedListItem>) =>
    request(`/api/v2/list-maintenance/${encodeURIComponent(listId)}/items`, { method: 'POST', body: JSON.stringify(payload) }),
  updateListItem: (listId: string, itemId: string, payload: Partial<LocalizedListItem>) =>
    request(`/api/v2/list-maintenance/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteListItem: (listId: string, itemId: string) =>
    request(`/api/v2/list-maintenance/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  listSubscriptionMembers: (subscriptionId: string) =>
    request<{
      capacity: { maximum: number; occupied: number; available: number };
      members: Array<Record<string, unknown>>;
    }>(`/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/members`),
  addSubscriptionMember: (
    subscriptionId: string,
    payload: {
      memberId?: string;
      newMember?: { firstName: string; lastName: string; email: string; phone?: string };
      joinedAt?: string;
      status?: 'active' | 'suspended';
      benefitsOverride?: Record<string, unknown>;
      restrictions?: Record<string, unknown>;
    },
  ) => request(`/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateSubscriptionMember: (
    subscriptionId: string,
    memberId: string,
    payload: {
      status: 'active' | 'suspended' | 'removed';
      futureBookingPolicy?: 'cancel' | 'keep' | 'manual_review';
      restrictions?: Record<string, unknown>;
    },
  ) => request(`/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/members/${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  getSubscriptionMemberHistory: (subscriptionId: string) =>
    request<{ history: Array<Record<string, unknown>> }>(`/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/member-history`),
};
