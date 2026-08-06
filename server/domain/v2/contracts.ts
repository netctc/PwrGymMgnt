export const MEMBER_STATUSES = ["active", "disabled", "archived"] as const;
export const SUBSCRIPTION_STATUSES = ["draft", "pending_activation", "active", "frozen", "suspended", "expired", "cancelled"] as const;
export const AFFILIATION_STATUSES = ["active", "suspended", "frozen", "expired", "removed"] as const;
export const PAYMENT_STATUSES = ["pending", "partial", "paid", "overdue", "waived", "refunded"] as const;

export type MemberStatus = typeof MEMBER_STATUSES[number];
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];
export type AffiliationStatus = typeof AFFILIATION_STATUSES[number];
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const ENTITLEMENT_REASON_CODES = [
  "ALLOWED",
  "MEMBER_NOT_FOUND",
  "MEMBER_DISABLED",
  "MEMBER_ARCHIVED",
  "NO_ELIGIBLE_SUBSCRIPTION",
  "CONTRACT_NOT_ACTIVE",
  "CONTRACT_NOT_STARTED",
  "CONTRACT_EXPIRED",
  "AFFILIATION_NOT_ACTIVE",
  "AFFILIATION_NOT_STARTED",
  "AFFILIATION_EXPIRED",
  "PAYMENT_PENDING",
  "PAYMENT_PARTIAL",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "SERVICE_NOT_INCLUDED",
  "NO_SESSIONS_AVAILABLE",
] as const;

export type EntitlementReasonCode = typeof ENTITLEMENT_REASON_CODES[number];

export type EntitlementCandidate = {
  memberId: string;
  memberStatus: MemberStatus;
  subscriptionId: string;
  affiliationId: string;
  contractStatus: SubscriptionStatus;
  affiliationStatus: AffiliationStatus;
  contractStartDate: string;
  contractEndDate: string;
  affiliationStartDate: string;
  affiliationEndDate: string;
  expectedPaymentDate: string;
  amountDue: string;
  amountPaid: string;
  currency: string;
  paymentStatus?: PaymentStatus;
  serviceTypes?: string[];
  sessionsRemaining?: number | null;
  isPrimary?: boolean;
  consumptionPriority?: number;
};

export type EntitlementDecision = {
  allowed: boolean;
  reasonCode: EntitlementReasonCode;
  memberId: string;
  subscriptionId: string | null;
  affiliationId: string | null;
  contractStatus: SubscriptionStatus | null;
  paymentStatus: PaymentStatus | null;
  balanceDue: string;
  currency: string | null;
  expectedPaymentDate: string | null;
  validUntil: string | null;
  sessionsRemaining: number | null;
  correctiveAction: string | null;
};
