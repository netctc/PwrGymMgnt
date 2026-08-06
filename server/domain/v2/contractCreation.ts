import crypto from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { appendDomainAudit, claimIdempotencyKey } from "./auditIdempotency";
import { assertExpectedPaymentDate, parseBusinessDate } from "./date";
import { minorToMoney, moneyToMinor } from "./money";

export type ContractTermsInput = {
  startDate: unknown;
  endDate?: unknown;
  durationDays: unknown;
  expectedPaymentDate: unknown;
  price: unknown;
};

export type ContractTerms = {
  startDate: string;
  endDate: string;
  expectedPaymentDate: string;
  price: string;
};

function addInclusiveDuration(startDate: string, durationDays: number) {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new Error("INVALID_CONTRACT_DURATION");
  }
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + durationDays - 1);
  return date.toISOString().slice(0, 10);
}

export function buildContractTerms(input: ContractTermsInput): ContractTerms {
  const startDate = parseBusinessDate(input.startDate);
  const endDate = input.endDate
    ? parseBusinessDate(input.endDate)
    : addInclusiveDuration(startDate, Number(input.durationDays));
  if (endDate < startDate) throw new Error("CONTRACT_END_BEFORE_START");
  const expectedPaymentDate = assertExpectedPaymentDate(
    input.expectedPaymentDate,
    startDate,
    endDate,
  );
  const priceMinor = moneyToMinor(input.price);
  if (priceMinor < 0n) throw new Error("NEGATIVE_CONTRACT_PRICE");
  return {
    startDate,
    endDate,
    expectedPaymentDate,
    price: minorToMoney(priceMinor),
  };
}

export function hashContractRequest(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function claimContractCreation(
  connection: PoolConnection,
  idempotencyKey: string,
  requestHash: string,
) {
  if (!idempotencyKey || idempotencyKey.length > 190) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  const claimed = await claimIdempotencyKey(
    connection,
    "subscription.create",
    idempotencyKey,
    requestHash,
  );
  if (claimed) return true;
  const [rows]: any = await connection.query(
    `SELECT request_hash, status, response_status, response_body
       FROM domain_idempotency_keys
      WHERE scope_key = 'subscription.create' AND idempotency_key = ?
      LIMIT 1 FOR UPDATE`,
    [idempotencyKey],
  );
  if (!rows.length || rows[0].request_hash !== requestHash) {
    throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
  }
  return false;
}

export async function completeContractCreation(
  connection: PoolConnection,
  idempotencyKey: string,
  responseStatus: number,
  responseBody: unknown,
) {
  await connection.query(
    `UPDATE domain_idempotency_keys
        SET status = 'completed', response_status = ?, response_body = ?
      WHERE scope_key = 'subscription.create' AND idempotency_key = ?`,
    [responseStatus, JSON.stringify(responseBody), idempotencyKey],
  );
}

export async function createInitialContractPeriod(
  connection: PoolConnection,
  input: {
    subscriptionId: string;
    terms: ContractTerms;
    actorId?: string | null;
    correlationId: string;
  },
) {
  const periodId = `period_${crypto.randomUUID().replace(/-/g, "")}`;
  await connection.query(
    `INSERT INTO subscription_periods_v2
      (id, subscription_id, period_number, start_date, end_date,
       expected_payment_date, status)
     VALUES (?, ?, 1, ?, ?, ?, 'active')`,
    [
      periodId,
      input.subscriptionId,
      input.terms.startDate,
      input.terms.endDate,
      input.terms.expectedPaymentDate,
    ],
  );
  await appendDomainAudit(connection, {
    entityType: "subscription",
    entityId: input.subscriptionId,
    eventType: "subscription_contract_created",
    actorId: input.actorId,
    correlationId: input.correlationId,
    after: {
      periodId,
      periodNumber: 1,
      ...input.terms,
    },
  });
  return periodId;
}
