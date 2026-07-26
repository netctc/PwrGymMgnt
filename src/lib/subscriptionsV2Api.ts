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
  holderFirstName?: string;
  holderLastName?: string;
  holderName?: string;
  status: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  pricePaid: number;
  currency: string;
  paymentStatus: string;
  expectedPaymentDate?: string | null;
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

export type SessionSummary = {
  subscriptionId: string;
  paymentStatus: string;
  sessionsUnlimited: boolean;
  sessionsPerCycle: number | null;
  cycleFrequency: string;
  distributionModel: string;
  cycleId: string | null;
  cycleNumber: number | null;
  cycleStartDate: string | null;
  cycleEndDate: string | null;
  nextResetDate: string | null;
  included: number;
  assigned: number;
  reserved: number;
  consumed: number;
  cancelledOrReturned: number;
  additional: number;
  accumulated: number;
  adjustmentsPositive: number;
  adjustmentsNegative: number;
  expired: number;
  remaining: number;
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
    const error = new Error(
      payload.error || `Request failed with ${response.status}`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
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

  createSubscription: (payload: { planVersionId: string; holderMemberId: string; startDate?: string; endDate?: string; paymentStatus?: string; paymentDate?: string }) =>
    apiRequest<{ subscription: SubscriptionV2; affiliationId: string }>('/api/v2/subscriptions', { method: 'POST', body: JSON.stringify(payload) }),

  updatePaymentStatus: (
    id: string,
    paymentStatus: string,
    paymentDate?: string,
  ) =>
    apiRequest<{ ok: boolean; previousPaymentStatus: string; paymentStatus: string; paymentDate: string; accountingStatus: string; invoiceNumber: string | null; paymentStatusLocked: boolean }>(
      `/api/v2/subscriptions/${encodeURIComponent(id)}/payment-status`,
      { method: 'PATCH', body: JSON.stringify({ paymentStatus, paymentDate }) },
    ),

  getSessionSummary: (id: string) =>
    apiRequest<{ summary: SessionSummary }>(
      `/api/v2/subscriptions/${encodeURIComponent(id)}/session-summary`,
    ),

  // Subscription Members
  listSubscriptionMembers: (subscriptionId: string) =>
    apiRequest<{ members: Array<{ id: string; subscriptionId: string; memberId: string; role: string; status: string; joinedAt: string | null; firstName: string; lastName: string; email: string }> }>(`/api/v2/subscriptions/${encodeURIComponent(subscriptionId)}/members`),

  addSubscriptionMember: (subscriptionId: string, payload: { memberId: string; role?: string }) =>
    apiRequest<{ subscriptionMember: any; affiliationId: string }>(`/api/v2/subscriptions/${encodeURIComponent(subscriptionId)}/members`, { method: 'POST', body: JSON.stringify(payload) }),

  removeSubscriptionMember: (subscriptionId: string, memberId: string) =>
    apiRequest<{ ok: boolean }>(`/api/v2/subscriptions/${encodeURIComponent(subscriptionId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }),

  // Affiliations
  listAffiliations: (memberId: string) =>
    apiRequest<{ affiliations: Affiliation[] }>(`/api/v2/affiliations?memberId=${encodeURIComponent(memberId)}`),

  setPrimaryAffiliation: (affiliationId: string) =>
    apiRequest<{ ok: boolean; affiliationId: string }>(
      `/api/v2/affiliations/${encodeURIComponent(affiliationId)}/primary`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  // Session Balances
  listSessionBalances: (params: { affiliationId?: string; subscriptionId?: string }) =>
    apiRequest<{ balances: SessionBalance[] }>(`/api/v2/session-balances${toQuery(params)}`),

  // Session Movements
  listSessionMovements: (params: { balanceId?: string; affiliationId?: string }) =>
    apiRequest<{ movements: SessionMovement[] }>(`/api/v2/session-movements${toQuery(params)}`),

  registerSessionEvent: (payload: {
    affiliationId: string;
    eventMoment: 'reservation' | 'booking_confirmation' | 'check_in' | 'service_start' | 'attendance_confirmation' | 'service_completion' | 'no_show';
    source: string;
    referenceType: string;
    referenceId: string;
    quantity?: number;
    reason?: string;
    idempotencyKey?: string;
  }) =>
    apiRequest<{ processed: boolean; configuredMoment?: string; movement?: SessionMovement | null }>(
      '/api/v2/sessions/register-event',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  // Feature Flags
  listFeatureFlags: () =>
    apiRequest<{ flags: FeatureFlag[] }>('/api/v2/feature-flags'),

  toggleFeatureFlag: (key: string, enabled: boolean) =>
    apiRequest<{ ok: boolean; key: string; enabled: boolean }>(`/api/v2/feature-flags/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),

  // Access
  authorizeAccess: (payload: {
    method: string;
    memberId?: string;
    accessToken?: string;
    /** @deprecated Send the raw QR/card bearer value in accessToken. */
    tokenHash?: string;
    accessPointId?: string;
    affiliationId?: string;
    reservationAffiliationId?: string;
    serviceType?: string;
    confirmSessionConsumption?: boolean;
    sessionAction?: 'consume' | 'recover';
    recoveryReason?: string;
    idempotencyKey?: string;
  }) =>
    apiRequest<any>('/api/access/authorize', { method: 'POST', body: JSON.stringify(payload) }),

  listAccessAttempts: (params: { memberId?: string; limit?: string } = {}) =>
    apiRequest<{ attempts: AccessAttempt[] }>(`/api/access/attempts${toQuery(params)}`),

  listAccessPoints: () =>
    apiRequest<{ accessPoints: any[] }>('/api/access/points'),

  createAccessPoint: (payload: { name: string; branch: string; zone?: string; direction?: string; accessMethods?: string[] }) =>
    apiRequest<{ accessPoint: any }>('/api/access/points', { method: 'POST', body: JSON.stringify(payload) }),

  // Subscription Lifecycle
  freezeSubscription: (id: string, reason?: string) =>
    apiRequest<{ ok: boolean; previousStatus: string; newStatus: string }>(`/api/v2/subscriptions/${encodeURIComponent(id)}/freeze`, { method: 'POST', body: JSON.stringify({ reason }) }),

  suspendSubscription: (id: string, reason?: string) =>
    apiRequest<{ ok: boolean; previousStatus: string; newStatus: string }>(`/api/v2/subscriptions/${encodeURIComponent(id)}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),

  reactivateSubscription: (id: string, reason?: string) =>
    apiRequest<{ ok: boolean; previousStatus: string; newStatus: string }>(`/api/v2/subscriptions/${encodeURIComponent(id)}/reactivate`, { method: 'POST', body: JSON.stringify({ reason }) }),

  cancelSubscription: (id: string, reason?: string) =>
    apiRequest<{ ok: boolean; previousStatus: string; newStatus: string }>(`/api/v2/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  renewSubscription: (
    id: string,
    payload: {
      paymentStatus: 'paid' | 'pending';
      paymentDate: string;
    } = {
      paymentStatus: 'pending',
      paymentDate: new Date().toISOString().slice(0, 10),
    },
  ) =>
    apiRequest<{ ok: boolean; newStartDate: string; newEndDate: string; paymentStatus: string; paymentDate: string; invoiceNumber: string }>(`/api/v2/subscriptions/${encodeURIComponent(id)}/renew`, { method: 'POST', body: JSON.stringify(payload) }),

  changePlan: (id: string, planVersionId: string) =>
    apiRequest<{ ok: boolean; newPlanVersionId: string; newEndDate: string }>(`/api/v2/subscriptions/${encodeURIComponent(id)}/change-plan`, { method: 'POST', body: JSON.stringify({ planVersionId }) }),
};
