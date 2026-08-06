import type { Pool } from "mysql2/promise";
import { compareBusinessDates, parseBusinessDate } from "./date";
import { minorToMoney, moneyToMinor } from "./money";
import type { EntitlementCandidate, EntitlementDecision, EntitlementReasonCode, PaymentStatus } from "./contracts";

function paymentStatus(candidate: EntitlementCandidate, today: string): PaymentStatus {
  const due = moneyToMinor(candidate.amountDue);
  const paid = moneyToMinor(candidate.amountPaid);
  if (candidate.paymentStatus === "waived") return "waived";
  if (candidate.paymentStatus === "refunded") return "refunded";
  if (paid >= due) return "paid";
  if (compareBusinessDates(today, candidate.expectedPaymentDate) > 0) return "overdue";
  return paid > 0n ? "partial" : "pending";
}

function denial(memberId: string, reasonCode: EntitlementReasonCode): EntitlementDecision {
  return { allowed: false, reasonCode, memberId, subscriptionId: null, affiliationId: null, contractStatus: null, paymentStatus: null, balanceDue: "0.00", currency: null, expectedPaymentDate: null, validUntil: null, sessionsRemaining: null, correctiveAction: reasonCode === "PAYMENT_OVERDUE" ? "SETTLE_BALANCE" : null };
}

function candidateReason(candidate: EntitlementCandidate, today: string, serviceType?: string): EntitlementReasonCode {
  if (candidate.memberStatus === "disabled") return "MEMBER_DISABLED";
  if (candidate.memberStatus === "archived") return "MEMBER_ARCHIVED";
  if (candidate.contractStatus !== "active") return "CONTRACT_NOT_ACTIVE";
  if (compareBusinessDates(today, candidate.contractStartDate) < 0) return "CONTRACT_NOT_STARTED";
  if (compareBusinessDates(today, candidate.contractEndDate) > 0) return "CONTRACT_EXPIRED";
  if (candidate.affiliationStatus !== "active") return "AFFILIATION_NOT_ACTIVE";
  if (compareBusinessDates(today, candidate.affiliationStartDate) < 0) return "AFFILIATION_NOT_STARTED";
  if (compareBusinessDates(today, candidate.affiliationEndDate) > 0) return "AFFILIATION_EXPIRED";
  const financial = paymentStatus(candidate, today);
  if (financial === "overdue") return "PAYMENT_OVERDUE";
  if (financial === "refunded") return "PAYMENT_REFUNDED";
  if (serviceType && candidate.serviceTypes?.length && !candidate.serviceTypes.includes(serviceType)) return "SERVICE_NOT_INCLUDED";
  if (candidate.sessionsRemaining !== null && candidate.sessionsRemaining !== undefined && candidate.sessionsRemaining <= 0) return "NO_SESSIONS_AVAILABLE";
  return financial === "pending" ? "PAYMENT_PENDING" : financial === "partial" ? "PAYMENT_PARTIAL" : "ALLOWED";
}

export function evaluateCandidates(
  memberId: string,
  candidates: EntitlementCandidate[],
  atDate: unknown,
  serviceType?: string,
  requestedAffiliationId?: string,
): EntitlementDecision {
  const today = parseBusinessDate(atDate);
  const applicableCandidates = requestedAffiliationId
    ? candidates.filter(candidate => candidate.affiliationId === requestedAffiliationId)
    : candidates;
  if (!applicableCandidates.length) return denial(memberId, "NO_ELIGIBLE_SUBSCRIPTION");
  const evaluated = applicableCandidates.map(candidate => ({ candidate, reason: candidateReason(candidate, today, serviceType) }));
  const eligible = evaluated.filter(item => ["ALLOWED", "PAYMENT_PENDING", "PAYMENT_PARTIAL"].includes(item.reason));
  if (!eligible.length) return denial(memberId, evaluated[0].reason);
  eligible.sort((a, b) => Number(Boolean(b.candidate.isPrimary)) - Number(Boolean(a.candidate.isPrimary)) || Number(a.candidate.consumptionPriority ?? 0) - Number(b.candidate.consumptionPriority ?? 0) || a.candidate.affiliationEndDate.localeCompare(b.candidate.affiliationEndDate) || a.candidate.affiliationId.localeCompare(b.candidate.affiliationId));
  const { candidate, reason } = eligible[0];
  const financial = paymentStatus(candidate, today);
  const balance = moneyToMinor(candidate.amountDue) - moneyToMinor(candidate.amountPaid);
  return { allowed: true, reasonCode: reason, memberId, subscriptionId: candidate.subscriptionId, affiliationId: candidate.affiliationId, contractStatus: candidate.contractStatus, paymentStatus: financial, balanceDue: minorToMoney(balance > 0n ? balance : 0n), currency: candidate.currency, expectedPaymentDate: candidate.expectedPaymentDate, validUntil: candidate.affiliationEndDate < candidate.contractEndDate ? candidate.affiliationEndDate : candidate.contractEndDate, sessionsRemaining: candidate.sessionsRemaining ?? null, correctiveAction: financial === "pending" || financial === "partial" ? "COLLECT_BEFORE_EXPECTED_PAYMENT_DATE" : null };
}

export class EntitlementService {
  constructor(private readonly pool: Pool) {}

  async evaluateEntitlement(
    memberId: string,
    serviceType: string | undefined,
    atDate: unknown,
    requestedAffiliationId?: string,
  ): Promise<EntitlementDecision> {
    const [rows]: any = await this.pool.query(
      `SELECT m.id AS member_id, LOWER(m.status) AS member_status,
              s.id AS subscription_id, LOWER(s.status) AS contract_status,
              DATE_FORMAT(s.start_date, '%Y-%m-%d') AS contract_start_date,
              DATE_FORMAT(s.end_date, '%Y-%m-%d') AS contract_end_date,
              a.id AS affiliation_id, LOWER(a.status) AS affiliation_status,
              DATE_FORMAT(a.start_date, '%Y-%m-%d') AS affiliation_start_date,
              DATE_FORMAT(a.end_date, '%Y-%m-%d') AS affiliation_end_date,
              DATE_FORMAT(s.estimated_payment_date, '%Y-%m-%d') AS expected_payment_date,
              COALESCE(i.total, s.price_snapshot) AS amount_due,
              COALESCE(payments.net_paid, 0) AS amount_paid,
              s.currency_snapshot AS currency, LOWER(s.payment_status) AS payment_status,
              a.is_primary, a.consumption_priority
         FROM members m
         JOIN affiliations a ON a.member_id = m.id
         JOIN subscriptions s ON s.id = a.subscription_id
         LEFT JOIN invoices i
           ON i.subscription_v2_id = s.id
          AND i.id = (
            SELECT latest.id FROM invoices latest
             WHERE latest.subscription_v2_id = s.id
             ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
          )
         LEFT JOIN (
           SELECT invoice_id,
                  SUM(CASE WHEN event_type = 'payment' THEN amount
                           WHEN event_type = 'refund' THEN -amount
                           WHEN event_type = 'waive' THEN amount ELSE 0 END) AS net_paid
             FROM invoice_payment_events_v2
            GROUP BY invoice_id
         ) payments ON payments.invoice_id = i.id
        WHERE m.id = ?`,
      [memberId],
    );
    const candidates: EntitlementCandidate[] = rows.map((row: any) => ({
      memberId: row.member_id, memberStatus: row.member_status, subscriptionId: row.subscription_id,
      affiliationId: row.affiliation_id, contractStatus: row.contract_status, affiliationStatus: row.affiliation_status,
      contractStartDate: row.contract_start_date, contractEndDate: row.contract_end_date,
      affiliationStartDate: row.affiliation_start_date, affiliationEndDate: row.affiliation_end_date,
      expectedPaymentDate: row.expected_payment_date || row.contract_start_date, amountDue: String(row.amount_due ?? "0"),
      amountPaid: String(row.amount_paid ?? "0"), currency: row.currency || "USD", paymentStatus: row.payment_status,
      isPrimary: Boolean(row.is_primary), consumptionPriority: Number(row.consumption_priority || 0), sessionsRemaining: null,
    }));
    return evaluateCandidates(memberId, candidates, atDate, serviceType, requestedAffiliationId);
  }
}
