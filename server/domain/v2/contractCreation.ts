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

export type ContractMember = {
  memberId: string;
  role: "holder" | "beneficiary";
};

export function buildContractMembers(
  holderMemberId: unknown,
  requestedMemberIds: unknown,
  maxMembers: unknown,
): ContractMember[] {
  const holder = typeof holderMemberId === "string" ? holderMemberId.trim() : "";
  if (!holder) throw new Error("HOLDER_MEMBER_REQUIRED");
  const capacity = Number(maxMembers);
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error("INVALID_PLAN_CAPACITY");
  }
  if (requestedMemberIds !== undefined && !Array.isArray(requestedMemberIds)) {
    throw new Error("MEMBER_IDS_MUST_BE_AN_ARRAY");
  }
  const ids = [
    holder,
    ...((requestedMemberIds || []) as unknown[]).map((value) =>
      typeof value === "string" ? value.trim() : "",
    ),
  ];
  if (ids.some((id) => !id)) throw new Error("INVALID_MEMBER_ID");
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length > capacity) throw new Error("CAPACITY_LIMIT_REACHED");
  return uniqueIds.map((memberId) => ({
    memberId,
    role: memberId === holder ? "holder" : "beneficiary",
  }));
}

export async function createContractParticipants(
  connection: PoolConnection,
  input: {
    subscriptionId: string;
    planId: string;
    planVersionId: string;
    members: ContractMember[];
    startDate: string;
    endDate: string;
    consumptionPriority: number;
    invitedBy?: string | null;
  },
) {
  const placeholders = input.members.map(() => "?").join(", ");
  const memberIds = input.members.map((member) => member.memberId);
  const [memberRows]: any = await connection.query(
    `SELECT id, status FROM members WHERE id IN (${placeholders}) FOR UPDATE`,
    memberIds,
  );
  const activeIds = new Set(
    memberRows
      .filter((row: any) => String(row.status || "").trim().toLowerCase() === "active")
      .map((row: any) => String(row.id)),
  );
  const invalidMemberIds = memberIds.filter((memberId) => !activeIds.has(memberId));
  if (invalidMemberIds.length) {
    throw Object.assign(new Error("CONTRACT_MEMBER_INVALID"), {
      status: 409,
      code: "CONTRACT_MEMBER_INVALID",
      invalidMemberIds,
    });
  }

  const [duplicateRows]: any = await connection.query(
    `SELECT DISTINCT a.member_id
       FROM affiliations a
       JOIN subscriptions s ON s.id = a.subscription_id
      WHERE a.member_id IN (${placeholders})
        AND a.status IN ('active', 'suspended', 'frozen')
        AND a.end_date >= CURDATE()
        AND s.plan_id = ?
        AND s.status IN ('active', 'suspended', 'frozen')
        AND s.end_date >= CURDATE()
      FOR UPDATE`,
    [...memberIds, input.planId],
  );
  if (duplicateRows.length) {
    throw Object.assign(new Error("DUPLICATE_ACTIVE_PLAN"), {
      status: 409,
      code: "DUPLICATE_ACTIVE_PLAN",
      duplicateMemberIds: duplicateRows.map((row: any) => String(row.member_id)),
    });
  }

  const [legacyDuplicateRows]: any = await connection.query(
    `SELECT DISTINCT member_id
       FROM member_subscriptions
      WHERE member_id IN (${placeholders})
        AND plan_id = ?
        AND LOWER(TRIM(status)) = 'active'
        AND end_date >= CURDATE()
      FOR UPDATE`,
    [...memberIds, input.planId],
  );
  if (legacyDuplicateRows.length) {
    throw Object.assign(new Error("DUPLICATE_ACTIVE_PLAN"), {
      status: 409,
      code: "DUPLICATE_ACTIVE_PLAN",
      duplicateMemberIds: legacyDuplicateRows.map((row: any) =>
        String(row.member_id),
      ),
    });
  }

  const participants: Array<ContractMember & {
    subscriptionMemberId: string;
    affiliationId: string;
  }> = [];
  for (const member of input.members) {
    const subscriptionMemberId = `sm_${crypto.randomUUID().replace(/-/g, "")}`;
    const affiliationId = `aff_${crypto.randomUUID().replace(/-/g, "")}`;
    const [primaryRows]: any = await connection.query(
      `SELECT id FROM affiliations
        WHERE member_id = ?
          AND status IN ('active', 'suspended', 'frozen')
          AND end_date >= CURDATE()
        LIMIT 1 FOR UPDATE`,
      [member.memberId],
    );
    await connection.query(
      `INSERT INTO subscription_members
        (id, subscription_id, member_id, role, status, joined_at, invited_by)
       VALUES (?, ?, ?, ?, 'active', NOW(), ?)`,
      [
        subscriptionMemberId,
        input.subscriptionId,
        member.memberId,
        member.role,
        input.invitedBy || null,
      ],
    );
    await connection.query(
      `INSERT INTO affiliations
        (id, member_id, subscription_id, subscription_member_id,
         plan_version_id, status, role, is_primary, start_date, end_date,
         consumption_priority)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [
        affiliationId,
        member.memberId,
        input.subscriptionId,
        subscriptionMemberId,
        input.planVersionId,
        member.role,
        primaryRows.length ? 0 : 1,
        input.startDate,
        input.endDate,
        input.consumptionPriority,
      ],
    );
    participants.push({ ...member, subscriptionMemberId, affiliationId });
  }
  return participants;
}

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
