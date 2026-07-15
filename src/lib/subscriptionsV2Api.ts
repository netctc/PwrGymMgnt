/**
 * Client API for V2 Subscriptions, Affiliations, Session Ledger, and Access.
 */

export type PlanVersion = {
  id: string;
  planId: string;
  planName: string;
  versionNumber: number;
  name: string;
  description: string;
  planType: 'individual' | 'family' | 'group' | 'corporate';
  price: number;
  currency: string;
  durationDays: number;
  autoRenew: boolean;
  maxMembers: number;
  sessionsUnlimited: boolean;
  sessionsPerCycle: number | null;
  cycleFrequency: string;
  distributionModel: 'shared' | 'individual' | 'custom';
  carryoverEnabled: boolean;
  carryoverMax: number | null;
  extraSessionPrice: number | null;
  consumptionPriority: number;
  gracePeriodDays: number;
  benefits: any;
  restrictions: any;
  bookingPolicy: any;
  status: string;
  publishedAt: string | null;
};

export type SubscriptionV2 = {
  id: string;
  planId: string;
  planVersionId: string;
  planName: string;
  planType: string;
  holderMemberId: string;
  status: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  pricePaid: number;
  currency: string;
  paymentStatus: string;
  maxMembers: number;
  sessionsUnlimited: boolean;
  sessionsPerCycle: number | null;
  distributionModel: string;
  version: number;
  legacySubscriptionId: string | null;
};

export type Affiliation = {
  id: string;
  memberId: string;
  subscriptionId: string;
  planVersionId: string;
  planName: string;
  planType: string;
  status: string;
  role: string;
  isPrimary: boolean;
  startDate: string;
  endDate: string;
  sessionsUnlimited: boolean;
  subscriptionStatus: string;
  consumptionPriority: number;
};

export type SessionBalance = {
  id: string;
  contextType: string;
  contextId: string;
  cycleId: string;
  included: number;
  carriedOver: number;
  purchased: number;
  adjustmentsPositive: number;
  refunds: number;
  reserved: number;
  consumed: number;
  expired: number;
  adjustmentsNegative: number;
  available: number;
  version: number;
};

export type SessionMovement = {
  id: string;
  balanceId: string;
  affiliationId: string | null;
  cycleId: string;
  movementType: string;
  quantity: number;
  direction: '+' | '-';
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  performedBy: string | null;
  createdAt: string | null;
};

export type AccessAttempt = {
  id: string;
  accessPointId: string | null;
  personType: string | null;
  personId: string | null;
  method: string;
  decision: string;
  denialReason: string | null;
  affiliationId: string | null;
  movementId: string | null;
  requestId: string | null;
  createdAt: string | null;
};

export type FeatureFlag = {
  id: string;
  key: string;
  enabled: boolean;
  scope: string;
  scopeValue: string | null;
  description: string | null;
};

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { credentials: 'include', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload as T;
}

function toQuery(params: Record<string, string | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value.trim() !== '') query.set(key, value);
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export const subscriptionsV2Api = {
  // Plan Versions
  listPlanVersions: (params: { planId?: string } = {}) =>
    apiRequest<{ planVersions: PlanVersion[] }>(`/api/v2/plan-versions${toQuery(params)}`),

  createPlanVersion: (payload: Partial<PlanVersion> & { planId: string }) =>
    apiRequest<{ planVersion: PlanVersion }>('/api/v2/plan-versions', { method: 'POST', body: JSON.stringify(payload) }),

  // Subscriptions
  listSubscriptions: (params: { memberId?: string; status?: string } = {}) =>
    apiRequest<{ subscriptions: SubscriptionV2[] }>(`/api/v2/subscriptions${toQuery(params)}`),

  createSubscription: (payload: { planVersionId: string; holderMemberId: string; startDate?: string; endDate?: string }) =>
    apiRequest<{ subscription: SubscriptionV2; affiliationId: string }>('/api/v2/subscriptions', { method: 'POST', body: JSON.stringify(payload) }),

  // Affiliations
  listAffiliations: (memberId: string) =>
    apiRequest<{ affiliations: Affiliation[] }>(`/api/v2/affiliations?memberId=${encodeURIComponent(memberId)}`),

  // Session Balances
  listSessionBalances: (params: { affiliationId?: string; subscriptionId?: string }) =>
    apiRequest<{ balances: SessionBalance[] }>(`/api/v2/session-balances${toQuery(params)}`),

  // Session Movements
  listSessionMovements: (params: { balanceId?: string; affiliationId?: string }) =>
    apiRequest<{ movements: SessionMovement[] }>(`/api/v2/session-movements${toQuery(params)}`),

  // Feature Flags
  listFeatureFlags: () =>
    apiRequest<{ flags: FeatureFlag[] }>('/api/v2/feature-flags'),

  toggleFeatureFlag: (key: string, enabled: boolean) =>
    apiRequest<{ ok: boolean; key: string; enabled: boolean }>(`/api/v2/feature-flags/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),

  // Access
  authorizeAccess: (payload: { method: string; memberId?: string; tokenHash?: string; accessPointId?: string; affiliationId?: string }) =>
    apiRequest<any>('/api/access/authorize', { method: 'POST', body: JSON.stringify(payload) }),

  listAccessAttempts: (params: { memberId?: string; limit?: string } = {}) =>
    apiRequest<{ attempts: AccessAttempt[] }>(`/api/access/attempts${toQuery(params)}`),

  listAccessPoints: () =>
    apiRequest<{ accessPoints: any[] }>('/api/access/points'),

  createAccessPoint: (payload: { name: string; branch: string; zone?: string; direction?: string; accessMethods?: string[] }) =>
    apiRequest<{ accessPoint: any }>('/api/access/points', { method: 'POST', body: JSON.stringify(payload) }),
};
