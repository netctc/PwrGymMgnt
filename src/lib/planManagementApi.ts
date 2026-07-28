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
  trainerId: string | null;
  trainerName: string;
  trainerCommissionPercent: number;
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
  holderSessionsPerCycle: number;
  beneficiarySessionsPerCycle: number;
  carryoverEnabled: boolean;
  carryoverMax: number | null;
  carryoverExpiryDays: number | null;
  allowExtraSessions: boolean;
  extraSessionPrice: number | null;
  consumptionPriority: number;
  sharedBenefits: boolean;
  futureBookingPolicy: string;
  bookingPolicy: {
    deductionMoment?: string;
    cancellationWindowMinutes?: number;
    autoRefundOnTime?: boolean;
    lateCancellationThreshold?: number;
    lateCancellationPenalty?: number;
    noShowConsumesSession?: boolean;
    reschedulingAllowed?: boolean;
    staffExceptionsAllowed?: boolean;
    gymCancellationRefund?: boolean;
  };
  benefits: Record<string, unknown>;
  restrictions: Record<string, unknown>;
  status: string;
};

export type TrainerOption = {
  id: string;
  name: string;
  email?: string;
  job_title?: string;
};

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error || `Request failed (${response.status})`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export const planManagementApi = {
  listPlans: () =>
    request<{ plans: ManagedPlan[] }>("/api/v2/plan-management/plans"),
  createPlan: (payload: Partial<ManagedPlan>) =>
    request<{ plan: ManagedPlan }>("/api/v2/plan-management/plans", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePlan: (id: string, payload: Partial<ManagedPlan>) =>
    request<{ plan: ManagedPlan }>(
      `/api/v2/plan-management/plans/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),
  listTrainers: () =>
    request<{ trainers: TrainerOption[] }>("/api/v2/trainer-commissions/trainers"),
  listMaintenance: () =>
    request<{ lists: MaintenanceList[] }>("/api/v2/list-maintenance"),
  addListItem: (listId: string, payload: Partial<LocalizedListItem>) =>
    request(`/api/v2/list-maintenance/${encodeURIComponent(listId)}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateListItem: (
    listId: string,
    itemId: string,
    payload: Partial<LocalizedListItem>,
  ) =>
    request(
      `/api/v2/list-maintenance/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),
  deleteListItem: (listId: string, itemId: string) =>
    request(
      `/api/v2/list-maintenance/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    ),
  listSubscriptionMembers: (subscriptionId: string) =>
    request<{
      subscription: {
        id: string;
        status: string;
        startDate: string;
        endDate: string;
        durationDays: number;
        planType: string;
        canModifyBeneficiaries: boolean;
      };
      capacity: { maximum: number; occupied: number; available: number };
      members: Array<Record<string, unknown>>;
    }>(
      `/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/members`,
    ),
  addSubscriptionMember: (
    subscriptionId: string,
    payload: {
      memberId?: string;
      newMember?: {
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
      };
      joinedAt?: string;
      status?: "active" | "suspended";
      benefitsOverride?: Record<string, unknown>;
      restrictions?: Record<string, unknown>;
    },
  ) =>
    request(
      `/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/members`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  updateSubscriptionMember: (
    subscriptionId: string,
    memberId: string,
    payload: {
      status: "active" | "suspended" | "removed";
      futureBookingPolicy?: "cancel" | "keep" | "manual_review";
      restrictions?: Record<string, unknown>;
    },
  ) =>
    request(
      `/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/members/${encodeURIComponent(memberId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
  updateBeneficiaryExpiry: (
    subscriptionId: string,
    memberId: string,
    endDate: string,
  ) =>
    request<{
      ok: boolean;
      previousEndDate: string;
      endDate: string;
      maximumEndDate: string;
      expiryOverride: boolean;
    }>(
      `/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/members/${encodeURIComponent(memberId)}/expiry`,
      { method: "PATCH", body: JSON.stringify({ endDate }) },
    ),
  changeSubscriptionHolder: (
    subscriptionId: string,
    newHolderMemberId: string,
  ) =>
    request<{
      ok: boolean;
      previousHolderMemberId: string;
      newHolderMemberId: string;
    }>(
      `/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/holder`,
      {
        method: "PATCH",
        body: JSON.stringify({ newHolderMemberId }),
      },
    ),
  getSubscriptionMemberHistory: (subscriptionId: string) =>
    request<{ history: Array<Record<string, unknown>> }>(
      `/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/member-history`,
    ),
  createHybridSubscription: (payload: {
    planVersionId: string;
    holder: {
      memberId?: string;
      newMember?: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
      };
    };
    startDate?: string;
    endDate?: string;
    addMembersNow: boolean;
    members: Array<{
      memberId?: string;
      newMember?: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
      };
      joinedAt?: string;
      restrictions?: Record<string, unknown>;
      benefitsOverride?: Record<string, unknown>;
    }>;
    notes?: string;
    paymentStatus?: "pending" | "partial" | "paid" | "overdue" | "waived" | "refunded";
  }) =>
    request<{
      subscription: {
        id: string;
        planName: string;
        planType: string;
        holderMemberId: string;
        startDate: string;
        endDate: string;
        maxMembers: number;
      };
      holder: { memberId: string; created: boolean };
      membersAdded: number;
      capacity: { maximum: number; occupied: number; available: number };
    }>("/api/v2/plan-management/subscriptions/hybrid", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSubscriptionDates: (
    subscriptionId: string,
    startDate: string,
    endDate: string,
  ) =>
    request<{ ok: boolean; startDate: string; endDate: string }>(
      `/api/v2/plan-management/subscriptions/${encodeURIComponent(subscriptionId)}/dates`,
      { method: "PATCH", body: JSON.stringify({ startDate, endDate }) },
    ),
};
