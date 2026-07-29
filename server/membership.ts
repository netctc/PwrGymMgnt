import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { type AuthenticatedRequest, requirePermission } from "./rbac";
import { validateBody } from "./validation";

type PoolProvider = () => Pool | null;

const idSchema = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9_.:-]+$/);
const ecardPdfSchema = z.object({
  token: z.string().trim().min(16).max(256),
  tokenId: idSchema,
  qrImageData: z.string().trim().startsWith("data:image/").max(2_800_000),
  fileName: z.string().trim().max(160).optional(),
});

const ecardDeliverySchema = ecardPdfSchema.extend({
  channel: z.enum(["email", "whatsapp"]),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

const validateAccessSchema = z.object({
  token: z.string().trim().min(16).max(256),
});

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) {
    const error = new Error("Database not connected");
    (error as any).status = 503;
    throw error;
  }
  return pool;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatDisplayDate(value: unknown) {
  const normalized = normalizeDate(value);
  return normalized || "";
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMysqlJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseJsonField(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value: unknown) {
  const normalized = normalizeDate(value);
  return normalized ? normalized.slice(0, 10) : null;
}

function deriveMemberStatus(row: any) {
  const storedStatus = String(row.status ?? row.data?.status ?? "active").trim().toLowerCase();
  const expiry = dateOnly(row.current_expiry ?? row.expiry_date ?? row.end_date ?? row.data?.currentExpiry);
  if (storedStatus === "active" && expiry && expiry < todayDateString()) return "expired";
  return storedStatus || "active";
}

function mapMember(row: any) {
  const data = parseJsonField(row.data);
  const rowWithData = { ...row, data };
  return {
    id: row.id,
    firstName: row.first_name ?? data.firstName ?? "",
    lastName: row.last_name ?? data.lastName ?? "",
    email: row.email ?? data.email ?? "",
    phone: row.phone ?? data.phone ?? "",
    status: deriveMemberStatus(rowWithData),
    storedStatus: row.status ?? data.status ?? "active",
    joinDate: row.join_date ?? data.joinDate ?? null,
    currentPlan: row.plan ?? data.currentPlan ?? data.subPlan ?? null,
    planDescription: data.planDescription ?? null,
    currentExpiry: dateOnly(row.current_expiry ?? data.currentExpiry ?? data.expiryDate),
    legacySubscriptionId: row.legacy_subscription_id ?? null,
    paymentInvoiceId: row.payment_invoice_id ?? null,
    paymentDueDate: dateOnly(row.payment_due_date),
    paymentStatus: row.legacy_subscription_id
      ? String(row.payment_invoice_status || "").toLowerCase() === "paid"
        ? "paid"
        : "pending"
      : null,
    lastAccess: row.last_access_at ?? data.lastAccess ?? data.last_access_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

async function getMultiUserMemberships(pool: Pool, memberId?: string) {
  const params: string[] = [];
  const memberFilter = memberId ? "AND a.member_id = ?" : "";
  if (memberId) params.push(memberId);
  const [rows]: any = await pool.query(
    `SELECT a.member_id, a.role, a.status AS affiliation_status,
            a.start_date AS affiliation_start_date,
            a.end_date AS affiliation_end_date,
            s.id AS subscription_id, s.status AS subscription_status,
            s.payment_status AS subscription_payment_status,
            s.start_date AS subscription_start_date,
            s.end_date AS subscription_end_date,
            s.max_members,
            pv.name AS plan_name,
            COALESCE(sp.description, pv.description) AS plan_description,
            pv.plan_type,
            (
              SELECT COUNT(*)
                FROM subscription_members sm_count
               WHERE sm_count.subscription_id = s.id
                 AND sm_count.status IN ('active', 'suspended')
            ) AS occupied_members,
            (
              SELECT GROUP_CONCAT(
                       CONCAT(
                         sm_group.member_id, '::',
                         COALESCE(m_group.first_name, ''), ' ',
                         COALESCE(m_group.last_name, ''), '::',
                         sm_group.role
                       )
                       ORDER BY (sm_group.role = 'holder') DESC, sm_group.joined_at
                       SEPARATOR '|||'
                     )
                FROM subscription_members sm_group
                JOIN members m_group ON m_group.id = sm_group.member_id
               WHERE sm_group.subscription_id = s.id
                 AND sm_group.status IN ('active', 'suspended')
            ) AS subscription_members_summary
       FROM affiliations a
       JOIN subscriptions s ON s.id = a.subscription_id
       JOIN plan_versions pv ON pv.id = s.plan_version_id
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE 1 = 1
        ${memberFilter}
      ORDER BY
        (s.status = 'active' AND s.end_date >= CURDATE()
         AND a.status IN ('active', 'suspended')) DESC,
        s.end_date DESC,
        a.updated_at DESC`,
    params,
  );
  const memberships = new Map<string, any>();
  for (const row of rows) {
    if (!memberships.has(row.member_id)) memberships.set(row.member_id, row);
  }
  return memberships;
}

async function getMemberPlanMemberships(pool: Pool, memberId?: string, includeHistorical = false) {
  const params: string[] = [];
  const v2MemberFilter = memberId ? "AND a.member_id = ?" : "";
  const v2LifecycleFilter = includeHistorical
    ? ""
    : `AND a.status IN ('active', 'suspended')
       AND s.status IN ('active', 'suspended', 'frozen')
       AND a.end_date >= CURDATE()`;
  if (memberId) params.push(memberId);
  const [v2Rows]: any = await pool.query(
    `SELECT a.member_id, a.id AS affiliation_id, a.subscription_id,
            a.role, a.status AS affiliation_status, a.is_primary,
            a.start_date, a.end_date,
            s.plan_id, s.status AS subscription_status, s.payment_status,
            s.legacy_subscription_id,
            pv.id AS plan_version_id, pv.name AS plan_name,
            COALESCE(sp.description, pv.description) AS plan_description,
            pv.plan_type, pv.sessions_unlimited, pv.distribution_model,
            pv.trainer_id, pv.trainer_name, pv.trainer_commission_percent,
            sc.id AS cycle_id,
            COALESCE(sb.included, 0) AS sessions_included,
            COALESCE(sb.consumed, 0) AS sessions_consumed,
            COALESCE(sb.reserved, 0) AS sessions_reserved,
            COALESCE(sb.available, 0) AS sessions_available
       FROM affiliations a
       JOIN subscriptions s ON s.id = a.subscription_id
       JOIN plan_versions pv ON pv.id = a.plan_version_id
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       LEFT JOIN subscription_cycles sc
         ON sc.subscription_id = s.id AND sc.status = 'active'
       LEFT JOIN session_balances sb
         ON sb.cycle_id = sc.id
        AND (
          (pv.distribution_model = 'shared'
           AND sb.context_type = 'subscription'
           AND sb.context_id = s.id)
          OR
          (pv.distribution_model <> 'shared'
           AND sb.context_type = 'affiliation'
           AND sb.context_id = a.id)
        )
      WHERE 1 = 1
        ${v2LifecycleFilter}
        ${v2MemberFilter}
      ORDER BY a.member_id, a.end_date DESC, a.is_primary DESC,
               a.consumption_priority ASC`,
    params,
  );
  const legacyParams: string[] = [];
  const legacyMemberFilter = memberId ? "AND ms.member_id = ?" : "";
  const legacyLifecycleFilter = includeHistorical
    ? ""
    : "AND LOWER(TRIM(ms.status)) = 'active' AND ms.end_date >= CURDATE()";
  if (memberId) legacyParams.push(memberId);
  const [legacyRows]: any = await pool.query(
    `SELECT ms.member_id, ms.id AS subscription_id, ms.plan_id,
            ms.plan_name, ms.status, ms.start_date, ms.end_date,
            ms.price, ms.currency, sp.description AS plan_description
       FROM member_subscriptions ms
       LEFT JOIN subscription_plans sp ON sp.id = ms.plan_id
      WHERE 1 = 1
        ${legacyLifecycleFilter}
        ${legacyMemberFilter}
      ORDER BY ms.member_id, ms.end_date ASC`,
    legacyParams,
  );
  const memberships = new Map<string, any[]>();
  const migratedLegacySubscriptions = new Set<string>();
  const append = (member: string, plan: any) => {
    const plans = memberships.get(member) || [];
    plans.push(plan);
    memberships.set(member, plans);
  };
  for (const row of v2Rows) {
    if (row.legacy_subscription_id) {
      migratedLegacySubscriptions.add(String(row.legacy_subscription_id));
    }
    append(row.member_id, {
      id: row.affiliation_id,
      affiliationId: row.affiliation_id,
      subscriptionId: row.subscription_id,
      planId: row.plan_id,
      planVersionId: row.plan_version_id,
      planName: row.plan_name || "",
      description: row.plan_description || null,
      planType: row.plan_type || "individual",
      trainerId: row.trainer_id || null,
      trainerName: row.trainer_name || null,
      trainerCommissionPercent: Number(row.trainer_commission_percent || 0),
      role: row.role || "beneficiary",
      status: row.affiliation_status,
      subscriptionStatus: row.subscription_status,
      paymentStatus: row.payment_status || "pending",
      isPrimary: Boolean(row.is_primary),
      startDate: dateOnly(row.start_date),
      endDate: dateOnly(row.end_date),
      sessionsUnlimited: Boolean(row.sessions_unlimited),
      distributionModel: row.distribution_model || "individual",
      sessionsIncluded: Number(row.sessions_included || 0),
      sessionsConsumed: Number(row.sessions_consumed || 0),
      sessionsReserved: Number(row.sessions_reserved || 0),
      sessionsPending: Number(row.sessions_available || 0),
    });
  }
  for (const row of legacyRows) {
    if (migratedLegacySubscriptions.has(String(row.subscription_id))) continue;
    append(row.member_id, {
      id: `legacy_${row.subscription_id}`,
      affiliationId: null,
      subscriptionId: row.subscription_id,
      planId: row.plan_id || null,
      planVersionId: null,
      planName: row.plan_name || "",
      description: row.plan_description || null,
      planType: "individual",
      trainerId: null,
      trainerName: null,
      trainerCommissionPercent: 0,
      role: "holder",
      status: row.status,
      subscriptionStatus: row.status,
      paymentStatus: null,
      isPrimary: false,
      startDate: dateOnly(row.start_date),
      endDate: dateOnly(row.end_date),
      sessionsUnlimited: true,
      distributionModel: "individual",
      sessionsIncluded: null,
      sessionsConsumed: null,
      sessionsReserved: null,
      sessionsPending: null,
    });
  }
  return memberships;
}

function mapSubscriptionGroupMembers(value: unknown) {
  if (typeof value !== "string" || !value) return [];
  return value.split("|||").map((entry) => {
    const [memberId, name, role] = entry.split("::");
    return {
      memberId,
      name: String(name || "").trim(),
      role: role || "beneficiary",
    };
  }).filter((entry) => entry.memberId);
}

async function getLegacyPlanDescriptions(pool: Pool) {
  const [rows]: any = await pool.query(
    "SELECT name, description FROM subscription_plans",
  );
  return new Map(
    rows.map((row: any) => [String(row.name || ""), row.description || null]),
  );
}

function enrichMemberWithSubscription(
  member: any,
  multiMembership?: any,
  memberPlans: any[] = [],
) {
  const hasLegacySubscription = Boolean(member.currentPlan || member.currentExpiry);
  if (!multiMembership) {
    return {
      ...member,
      subscriptionType: hasLegacySubscription ? "individual" : "none",
      multiUserRole: null,
      multiUserPlanType: null,
      multiUserSubscriptionId: null,
      holderActionLocked: false,
      planDescription: member.planDescription || null,
      multiUserMembers: [],
      multiUserCapacity: null,
      paymentStatus: member.paymentStatus || null,
      paymentAttentionRequired: member.paymentStatus === "pending",
      plans: memberPlans,
    };
  }
  const multiSubscriptionEndDate = dateOnly(
    multiMembership.subscription_end_date,
  );
  const multiActive =
    multiMembership.subscription_status === "active" &&
    Boolean(
      multiSubscriptionEndDate &&
        multiSubscriptionEndDate >= todayDateString(),
    ) &&
    ["active", "suspended"].includes(multiMembership.affiliation_status);
  if (multiMembership.plan_type === "individual") {
    return {
      ...member,
      currentPlan: multiMembership.plan_name || member.currentPlan,
      currentExpiry:
        dateOnly(multiMembership.affiliation_end_date) ||
        multiSubscriptionEndDate ||
        member.currentExpiry,
      subscriptionType: "individual",
      multiUserRole: null,
      multiUserPlanType: null,
      multiUserSubscriptionId: multiMembership.subscription_id,
      multiUserSubscriptionStatus: multiMembership.subscription_status,
      multiUserSubscriptionEndDate: multiSubscriptionEndDate,
      holderActionLocked: false,
      planDescription:
        multiMembership.plan_description || member.planDescription || null,
      multiUserMembers: [],
      multiUserCapacity: null,
      paymentStatus: multiMembership.subscription_payment_status || null,
      paymentAttentionRequired: ["pending", "partial", "overdue"].includes(
        multiMembership.subscription_payment_status,
      ),
      plans: memberPlans,
    };
  }
  if (!multiActive && hasLegacySubscription) {
    return {
      ...member,
      subscriptionType: "individual",
      multiUserRole: null,
      multiUserPlanType: null,
      multiUserSubscriptionId: null,
      holderActionLocked: false,
      planDescription: member.planDescription || null,
      multiUserMembers: [],
      multiUserCapacity: null,
      paymentStatus: member.paymentStatus || null,
      paymentAttentionRequired: member.paymentStatus === "pending",
      plans: memberPlans,
    };
  }
  return {
    ...member,
    currentPlan: multiMembership.plan_name || member.currentPlan,
    currentExpiry:
      dateOnly(multiMembership.affiliation_end_date) ||
      dateOnly(multiMembership.subscription_end_date) ||
      member.currentExpiry,
    subscriptionType: "multi_user",
    multiUserRole: multiMembership.role,
    multiUserPlanType: multiMembership.plan_type,
    multiUserSubscriptionId: multiMembership.subscription_id,
    multiUserSubscriptionStatus: multiMembership.subscription_status,
    multiUserSubscriptionEndDate: multiSubscriptionEndDate,
    holderActionLocked: multiActive && multiMembership.role === "holder",
    planDescription: multiMembership.plan_description || null,
    multiUserMembers: mapSubscriptionGroupMembers(
      multiMembership.subscription_members_summary,
    ),
    multiUserCapacity: {
      maximum: Number(multiMembership.max_members || 0),
      occupied: Number(multiMembership.occupied_members || 0),
      available: Math.max(
        0,
        Number(multiMembership.max_members || 0) -
          Number(multiMembership.occupied_members || 0),
      ),
    },
    paymentStatus: multiMembership.subscription_payment_status || null,
    paymentAttentionRequired: ["pending", "partial", "overdue"].includes(
      multiMembership.subscription_payment_status,
    ),
    plans: memberPlans,
  };
}

async function assertMemberCanBeRestricted(pool: Pool, memberId: string) {
  const [rows]: any = await pool.query(
    `SELECT s.id, pv.name AS plan_name
       FROM subscriptions s
       JOIN plan_versions pv ON pv.id = s.plan_version_id
      WHERE s.holder_member_id = ?
        AND s.status = 'active'
        AND s.end_date >= CURDATE()
        AND pv.plan_type <> 'individual'
      LIMIT 1`,
    [memberId],
  );
  if (rows.length) {
    throw Object.assign(
      new Error(
        `Transfer the holder role to an active beneficiary before changing or archiving this member (${rows[0].plan_name})`,
      ),
      { status: 409, code: "ACTIVE_MULTI_USER_HOLDER" },
    );
  }
}

function mapPlan(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    durationDays: Number(row.duration_days || 0),
    price: Number(row.price || 0),
    currency: row.currency || "USD",
    status: row.status || "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

function mapSubscription(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    memberId: row.member_id,
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    price: Number(row.price || 0),
    currency: row.currency || "USD",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

function mapInvoice(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    memberId: row.member_id,
    subscriptionId: row.subscription_id,
    status: row.status,
    subtotal: Number(row.subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    currency: row.currency || "USD",
    dueDate: row.due_date,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

export async function loadCurrentEcardSubscription(pool: Pool, memberId: string) {
  // Legacy source used by existing individual memberships.
  const [rows]: any = await pool.query(
    `SELECT id, member_id, plan_id, plan_name, status, start_date, end_date, price, currency, created_at, updated_at, data,
            'member_subscriptions' AS source_table
       FROM member_subscriptions
      WHERE member_id = ?
        AND LOWER(TRIM(status)) = 'active'
        AND (start_date IS NULL OR DATE(start_date) <= CURDATE())
        AND end_date IS NOT NULL
        AND DATE(end_date) >= CURDATE()
      ORDER BY DATE(end_date) DESC, updated_at DESC
      LIMIT 1`,
    [memberId],
  );
  if (rows[0]) return rows[0];

  // V2 source used by individual and multi-user affiliations. This fallback is
  // essential for active holders/beneficiaries that no longer have a row in
  // member_subscriptions.
  const [v2Rows]: any = await pool.query(
    `SELECT s.id, a.member_id, s.plan_id, pv.name AS plan_name,
            s.status, s.start_date, s.end_date, s.price_paid AS price,
            s.currency, s.created_at, s.updated_at, s.data,
            'subscriptions' AS source_table
       FROM affiliations a
       JOIN subscriptions s ON s.id = a.subscription_id
       JOIN plan_versions pv ON pv.id = s.plan_version_id
      WHERE a.member_id = ?
        AND a.status = 'active'
        AND a.start_date <= CURDATE()
        AND a.end_date >= CURDATE()
        AND s.status = 'active'
        AND s.start_date <= CURDATE()
        AND s.end_date >= CURDATE()
      ORDER BY s.end_date DESC, s.updated_at DESC
      LIMIT 1`,
    [memberId],
  );
  return v2Rows[0] || null;
}


function dataUrlToImageFormat(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg") ? "JPEG" : "PNG";
}

const MAX_ECARD_IMAGE_BYTES = Number(process.env.ECARD_IMAGE_MAX_BYTES || 2 * 1024 * 1024);

function getAllowedEcardImageOrigins() {
  return new Set(
    (process.env.ECARD_IMAGE_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

function isPrivateIp(ip: string) {
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

async function assertSafeRemoteImageUrl(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) return false;
  const allowedOrigins = getAllowedEcardImageOrigins();
  if (!allowedOrigins.has(url.origin)) return false;
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) return false;

  const lookup = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (lookup.length === 0) return false;
  return lookup.every((entry) => !isPrivateIp(entry.address));
}

async function imageSourceToDataUrl(source: unknown) {
  const value = normalizeString(source);
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  if (!/^https?:\/\//i.test(value)) return "";
  try {
    const isAllowed = await assertSafeRemoteImageUrl(value);
    if (!isAllowed) return "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ECARD_IMAGE_FETCH_TIMEOUT_MS || 4000));
    const response = await fetch(value, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return "";
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].some((type) => contentType.startsWith(type))) return "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_ECARD_IMAGE_BYTES) return "";
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_ECARD_IMAGE_BYTES) return "";
    return `data:${contentType || "image/png"};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  } catch {
    return "";
  }
}

function pdfArrayBufferToBuffer(pdf: jsPDF) {
  return Buffer.from(pdf.output("arraybuffer") as ArrayBuffer);
}

function buildSafeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "powergym-ecard";
}

async function getEcardTemplateSettings(pool: Pool) {
  const [rows]: any = await pool.query("SELECT data FROM settings WHERE id = 'general' LIMIT 1");
  const data = parseJsonField(rows?.[0]?.data);
  return {
    backgroundImage: normalizeString((data as any).ecardBackgroundImage),
    title: normalizeString((data as any).ecardTitle) || "PowerGym QR e-Card",
    note: normalizeString((data as any).ecardNote) || "Present this QR e-card at reception for access validation.",
  };
}

function assertQrImageData(value: unknown) {
  const qrImageData = normalizeString(value);
  if (!qrImageData.startsWith("data:image/")) {
    const error = new Error("QR image data is required. Generate the QR token before creating the e-card PDF.");
    (error as any).status = 400;
    throw error;
  }
  return qrImageData;
}

async function buildEcardPdfBuffer(
  pool: Pool,
  input: { member: any; subscription: any; token: string; qrImageData: string },
) {
  const template = await getEcardTemplateSettings(pool);
  const member = mapMember(input.member);
  const subscription = mapSubscription(input.subscription);
  const memberName = `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.email || member.id;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const backgroundDataUrl = await imageSourceToDataUrl(template.backgroundImage);
  if (backgroundDataUrl) {
    try {
      pdf.addImage(backgroundDataUrl, dataUrlToImageFormat(backgroundDataUrl), 0, 0, pageWidth, pageHeight);
    } catch {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
    }
  } else {
    pdf.setFillColor(248, 250, 252);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.setFillColor(37, 99, 235);
    pdf.rect(0, 0, pageWidth, 110, "F");
  }

  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(56, 72, pageWidth - 112, pageHeight - 144, 18, 18, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(15, 23, 42);
  pdf.text(template.title, pageWidth / 2, 128, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(100, 116, 139);
  pdf.text(template.note, pageWidth / 2, 150, { align: "center", maxWidth: pageWidth - 150 });

  const qrSize = 220;
  const qrX = (pageWidth - qrSize) / 2;
  pdf.addImage(input.qrImageData, dataUrlToImageFormat(input.qrImageData), qrX, 188, qrSize, qrSize);

  let y = 455;
  const labelX = 112;
  const valueX = 270;
  const lineGap = 28;
  const addLine = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(71, 85, 105);
    pdf.text(label, labelX, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(value || "-", valueX, y, { maxWidth: pageWidth - valueX - 80 });
    y += lineGap;
  };

  addLine("Member", memberName);
  addLine("Plan", subscription.planName || member.currentPlan || "-");
  addLine("Expiry Date", formatDisplayDate(subscription.endDate));
  addLine("Member ID", member.id);

  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)}`, pageWidth / 2, pageHeight - 88, { align: "center" });

  return {
    buffer: pdfArrayBufferToBuffer(pdf),
    memberName,
    planName: subscription.planName || member.currentPlan || "Plan",
    expiryDate: formatDisplayDate(subscription.endDate),
    fileName: `${buildSafeFileName(memberName)}_QR_eCard.pdf`,
  };
}

async function loadValidatedEcardData(pool: Pool, input: { memberId: string; token: string; tokenId: string }) {
  const [tokens]: any = await pool.query(
    `SELECT * FROM access_tokens
     WHERE id = ?
       AND member_id = ?
       AND token_hash = ?
       AND status = 'active'
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at >= NOW())
     LIMIT 1`,
    [input.tokenId, input.memberId, hashToken(input.token)],
  );
  if (tokens.length === 0) {
    const error = new Error("Invalid, expired, revoked or member-mismatched e-card token");
    (error as any).status = 403;
    throw error;
  }

  const [members]: any = await pool.query("SELECT * FROM members WHERE id = ? AND LOWER(TRIM(status)) = 'active'", [input.memberId]);
  if (members.length === 0) {
    const error = new Error("Active member not found for e-card token");
    (error as any).status = 404;
    throw error;
  }

  const subscription = await loadCurrentEcardSubscription(pool, input.memberId);
  if (!subscription) {
    const error = new Error("Member has no active subscription for e-card PDF");
    (error as any).status = 400;
    throw error;
  }
  return { tokenRow: tokens[0], member: members[0], subscription };
}

async function sendEcardByEmail(input: { to: string; from: string; subject: string; text: string; pdfBuffer: Buffer; fileName: string }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    const error = new Error("Email provider is not configured. Set SENDGRID_API_KEY and ECARD_FROM_EMAIL to send e-card PDFs by email.");
    (error as any).status = 501;
    throw error;
  }
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: input.from },
      subject: input.subject,
      content: [{ type: "text/plain", value: input.text }],
      attachments: [{ content: input.pdfBuffer.toString("base64"), filename: input.fileName, type: "application/pdf", disposition: "attachment" }],
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    const error = new Error(`Email delivery failed: ${message || response.statusText}`);
    (error as any).status = 502;
    throw error;
  }
}


export function isEcardWhatsAppConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(normalizeString(env.WHATSAPP_CLOUD_TOKEN) && normalizeString(env.WHATSAPP_PHONE_NUMBER_ID));
}

export function getEcardWhatsAppConfigurationError() {
  return "WhatsApp provider is not configured. Set WHATSAPP_CLOUD_TOKEN and WHATSAPP_PHONE_NUMBER_ID to send e-card PDFs by WhatsApp.";
}

async function sendEcardByWhatsApp(input: { toPhone: string; caption: string; pdfBuffer: Buffer; fileName: string }) {
  const token = normalizeString(process.env.WHATSAPP_CLOUD_TOKEN);
  const phoneNumberId = normalizeString(process.env.WHATSAPP_PHONE_NUMBER_ID);
  if (!isEcardWhatsAppConfigured()) {
    const error = new Error(getEcardWhatsAppConfigurationError());
    (error as any).status = 501;
    throw error;
  }
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([input.pdfBuffer], { type: "application/pdf" }), input.fileName);
  const upload = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const uploadPayload: any = await upload.json().catch(() => ({}));
  if (!upload.ok || !uploadPayload.id) {
    const error = new Error(`WhatsApp media upload failed: ${JSON.stringify(uploadPayload)}`);
    (error as any).status = 502;
    throw error;
  }
  const send = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.toPhone.replace(/\D/g, ""),
      type: "document",
      document: { id: uploadPayload.id, filename: input.fileName, caption: input.caption },
    }),
  });
  if (!send.ok) {
    const message = await send.text().catch(() => "");
    const error = new Error(`WhatsApp delivery failed: ${message || send.statusText}`);
    (error as any).status = 502;
    throw error;
  }
}

async function ensureColumn(pool: Pool, tableName: string, columnName: string, definition: string) {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  if (Number(rows?.[0]?.count || 0) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function ensureMembershipSchema(pool: Pool) {
  await ensureColumn(pool, "members", "last_access_at", "DATETIME NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT NULL,
      duration_days INT NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency VARCHAR(12) NOT NULL DEFAULT 'USD',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_subscription_plans_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_subscriptions (
      id VARCHAR(64) PRIMARY KEY,
      member_id VARCHAR(255) NOT NULL,
      plan_id VARCHAR(64) NULL,
      plan_name VARCHAR(120) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency VARCHAR(12) NOT NULL DEFAULT 'USD',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_member_subscriptions_member (member_id),
      INDEX idx_member_subscriptions_dates (start_date, end_date),
      INDEX idx_member_subscriptions_status (status),
      CONSTRAINT fk_member_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(64) PRIMARY KEY,
      invoice_number VARCHAR(64) UNIQUE NOT NULL,
      member_id VARCHAR(255) NOT NULL,
      subscription_id VARCHAR(64) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'issued',
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency VARCHAR(12) NOT NULL DEFAULT 'USD',
      due_date DATE NULL,
      paid_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_invoices_member (member_id),
      INDEX idx_invoices_subscription (subscription_id),
      INDEX idx_invoices_status (status),
      CONSTRAINT fk_invoices_subscription FOREIGN KEY (subscription_id) REFERENCES member_subscriptions(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      transaction_date DATE NOT NULL,
      source VARCHAR(120) NULL,
      reference_type VARCHAR(64) NOT NULL DEFAULT 'manual',
      reference_id VARCHAR(64) NULL,
      description TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'posted',
      attachment_url TEXT NULL,
      created_by VARCHAR(255) NULL,
      approved_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_finance_tx_date (transaction_date),
      INDEX idx_finance_tx_type (type),
      INDEX idx_finance_tx_category (category),
      INDEX idx_finance_tx_status (status),
      UNIQUE KEY uq_finance_reference (reference_type, reference_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_tokens (
      id VARCHAR(64) PRIMARY KEY,
      member_id VARCHAR(255) NOT NULL,
      token_hash CHAR(64) UNIQUE NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      expires_at DATETIME NULL,
      revoked_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_access_tokens_member (member_id),
      INDEX idx_access_tokens_hash (token_hash)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecard_delivery_logs (
      id VARCHAR(64) PRIMARY KEY,
      member_id VARCHAR(255) NOT NULL,
      token_id VARCHAR(64) NULL,
      channel VARCHAR(32) NOT NULL,
      recipient VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_ecard_delivery_member (member_id),
      INDEX idx_ecard_delivery_channel (channel),
      INDEX idx_ecard_delivery_status (status)
    )
  `);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function deriveRenewalStartDate(currentEndDate: unknown) {
  const today = todayDate();
  const expiry = normalizeDate(currentEndDate);
  if (expiry && expiry >= today) return addDays(expiry, 1);
  return today;
}

function buildReceiptPdf(invoice: any, member: any, subscription: any) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 54;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PowerGym Membership Receipt", margin, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, pageWidth - margin, y, { align: "right" });
  y += 34;

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 28;

  const memberName = `${member?.first_name || ""} ${member?.last_name || ""}`.trim() || invoice.member_id;
  const rows = [
    ["Receipt / Invoice", invoice.invoice_number || invoice.id],
    ["Member", memberName],
    ["Email", member?.email || "-"],
    ["Plan", subscription?.plan_name || "Membership renewal"],
    ["Subscription", `${formatDisplayDate(subscription?.start_date)} - ${formatDisplayDate(subscription?.end_date)}`],
    ["Status", invoice.status || "issued"],
    ["Due date", formatDisplayDate(invoice.due_date) || "-"],
    ["Paid at", formatDisplayDate(invoice.paid_at) || "-"],
  ];

  doc.setFontSize(11);
  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value || "-"), margin + 128, y);
    y += 22;
  });

  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Payment Summary", margin, y);
  y += 24;
  doc.setFontSize(11);
  const money = (amount: unknown) => `${Number(amount || 0).toFixed(2)} ${invoice.currency || "USD"}`;
  [["Subtotal", invoice.subtotal], ["Tax", invoice.tax_amount], ["Total", invoice.total]].forEach(([label, amount]) => {
    doc.setFont("helvetica", label === "Total" ? "bold" : "normal");
    doc.text(String(label), margin, y);
    doc.text(money(amount), pageWidth - margin, y, { align: "right" });
    y += 22;
  });

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("This receipt is generated from PowerGym Management and is linked to the member subscription renewal.", margin, y);
  return Buffer.from(doc.output("arraybuffer"));
}

async function insertMembershipRenewalFinanceTransaction(connection: any, payload: { invoiceId: string; invoiceNumber: string; memberId: string; subscriptionId: string; memberName: string; planName: string; total: number; currency: string; date: string; status?: "posted" | "pending"; userEmail?: string }) {
  const amount = Number(payload.total || 0);
  if (amount <= 0) return;
  const accountingStatus = payload.status || "posted";
  const transactionId = createId("ftx");
  await connection.query(
    `INSERT INTO finance_transactions
      (id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status, attachment_url, created_by, approved_by, data)
     VALUES (?, 'income', 'Membership Renewal', ?, ?, 'membership', 'membership_invoice', ?, ?, ?, NULL, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       transaction_date = VALUES(transaction_date),
       description = VALUES(description),
       status = VALUES(status),
       approved_by = VALUES(approved_by),
       updated_at = CURRENT_TIMESTAMP`,
    [
      transactionId,
      amount,
      payload.date,
      payload.invoiceId,
      `Membership renewal ${payload.invoiceNumber} - ${payload.memberName} - ${payload.planName}`,
      accountingStatus,
      payload.userEmail || "system",
      accountingStatus === "posted" ? payload.userEmail || "system" : null,
      toMysqlJson({ source: "membership_renewal", memberId: payload.memberId, subscriptionId: payload.subscriptionId, invoiceId: payload.invoiceId, invoiceNumber: payload.invoiceNumber, currency: payload.currency }),
    ],
  );
}

function makeInvoiceNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `INV-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function registerMembershipRoutes(app: Express, poolProvider: PoolProvider) {
  app.use("/api/membership", requirePermission("membership.read"));
  let schemaReady: Promise<void> | null = null;

  async function getReadyPool() {
    const pool = requirePool(poolProvider);
    schemaReady ||= ensureMembershipSchema(pool);
    await schemaReady;
    return pool;
  }

  app.get("/api/membership/plans", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [rows]: any = await pool.query(
        "SELECT * FROM subscription_plans ORDER BY status ASC, price ASC, name ASC",
      );
      res.json({ plans: rows.map(mapPlan) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/membership/plans", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const name = normalizeString(req.body.name);
      const durationDays = numberOrDefault(req.body.durationDays, 0);
      const price = numberOrDefault(req.body.price, 0);
      const currency = normalizeString(req.body.currency) || "USD";
      const status = normalizeString(req.body.status) || "active";
      const description = normalizeString(req.body.description);

      if (!name) return res.status(400).json({ error: "Plan name is required" });
      if (durationDays <= 0) return res.status(400).json({ error: "durationDays must be greater than zero" });
      if (price < 0) return res.status(400).json({ error: "price cannot be negative" });

      const pool = await getReadyPool();
      const id = normalizeString(req.body.id) || createId("plan");
      await pool.query(
        `INSERT INTO subscription_plans (id, name, description, duration_days, price, currency, status, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, description || null, durationDays, price, currency, status, toMysqlJson(req.body.data)],
      );
      const [rows]: any = await pool.query("SELECT * FROM subscription_plans WHERE id = ?", [id]);
      res.status(201).json({ plan: mapPlan(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/membership/plans/:id", requirePermission("membership.write"), async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [existing]: any = await pool.query("SELECT * FROM subscription_plans WHERE id = ?", [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ error: "Plan not found" });

      const current = mapPlan(existing[0]);
      const name = normalizeString(req.body.name) || current.name;
      const durationDays = req.body.durationDays === undefined ? current.durationDays : numberOrDefault(req.body.durationDays, 0);
      const price = req.body.price === undefined ? current.price : numberOrDefault(req.body.price, 0);
      const currency = normalizeString(req.body.currency) || current.currency;
      const status = normalizeString(req.body.status) || current.status;
      const description = req.body.description === undefined ? current.description : normalizeString(req.body.description);

      if (durationDays <= 0) return res.status(400).json({ error: "durationDays must be greater than zero" });
      if (price < 0) return res.status(400).json({ error: "price cannot be negative" });

      await pool.query(
        `UPDATE subscription_plans
         SET name = ?, description = ?, duration_days = ?, price = ?, currency = ?, status = ?, data = ?
         WHERE id = ?`,
        [name, description || null, durationDays, price, currency, status, toMysqlJson(req.body.data ?? current.data), req.params.id],
      );
      const [rows]: any = await pool.query("SELECT * FROM subscription_plans WHERE id = ?", [req.params.id]);
      res.json({ plan: mapPlan(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/membership/members", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const search = normalizeString(req.query.search);
      const status = normalizeString(req.query.status);
      const subscriptionStatusFilter = normalizeString(req.query.subscriptionStatus).toLowerCase();
      const accessDate = normalizeDate(req.query.accessDate);
      const accessedToday = normalizeString(req.query.accessedToday).toLowerCase() === "true";
      const currentPlanFilter = normalizeString(req.query.currentPlan).toLowerCase();
      const paymentStatusFilter = normalizeString(req.query.paymentStatus).toLowerCase();
      const expiryDateFilter = normalizeDate(req.query.expiryDate);
      const requestedSort = normalizeString(req.query.sortBy).toLowerCase();
      const allowedSorts = new Set([
        "expiry_asc",
        "expiry_desc",
        "joined_asc",
        "joined_desc",
        "last_access_asc",
        "last_access_desc",
      ]);
      const sortBy = allowedSorts.has(requestedSort)
        ? requestedSort
        : "joined_desc";
      const requestedPage = Math.max(1, Number.parseInt(normalizeString(req.query.page) || "1", 10) || 1);
      const requestedPageSize = Number.parseInt(normalizeString(req.query.pageSize) || "25", 10);
      const pageSize = [10, 25, 50].includes(requestedPageSize)
        ? requestedPageSize
        : 25;
      const params: any[] = [];
      const filters: string[] = [];

      if (search) {
        filters.push("(LOWER(m.first_name) LIKE ? OR LOWER(m.last_name) LIKE ? OR LOWER(m.email) LIKE ? OR m.phone LIKE ?)");
        const like = `%${search.toLowerCase()}%`;
        params.push(like, like, like, `%${search}%`);
      }
      if (status) {
        if (status === "expired") {
          filters.push("LOWER(TRIM(m.status)) = 'active' AND current_subscription.current_expiry IS NOT NULL AND DATE(current_subscription.current_expiry) < CURDATE()");
        } else if (status === "active") {
          filters.push("LOWER(TRIM(m.status)) = 'active' AND (current_subscription.current_expiry IS NULL OR DATE(current_subscription.current_expiry) >= CURDATE())");
        } else {
          filters.push("LOWER(TRIM(m.status)) = ?");
          params.push(status.toLowerCase());
        }
      }
      if (accessedToday) {
        filters.push("DATE(m.last_access_at) = CURDATE()");
      } else if (accessDate) {
        filters.push("DATE(m.last_access_at) = ?");
        params.push(accessDate);
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT m.*, current_subscription.current_expiry,
                legacy_subscription.id AS legacy_subscription_id,
                legacy_invoice.id AS payment_invoice_id,
                legacy_invoice.status AS payment_invoice_status,
                legacy_invoice.due_date AS payment_due_date
           FROM members m
           LEFT JOIN (
             SELECT member_id, MAX(end_date) AS current_expiry
               FROM member_subscriptions
              WHERE LOWER(TRIM(status)) = 'active'
              GROUP BY member_id
           ) current_subscription ON current_subscription.member_id = m.id
           LEFT JOIN member_subscriptions legacy_subscription
             ON legacy_subscription.id = (
               SELECT ms_latest.id
                 FROM member_subscriptions ms_latest
                WHERE ms_latest.member_id = m.id
                ORDER BY
                  (LOWER(TRIM(ms_latest.status)) = 'active') DESC,
                  ms_latest.end_date DESC,
                  ms_latest.created_at DESC
                LIMIT 1
             )
           LEFT JOIN invoices legacy_invoice
             ON legacy_invoice.id = (
               SELECT i_latest.id
                 FROM invoices i_latest
                WHERE i_latest.subscription_id = legacy_subscription.id
                ORDER BY i_latest.created_at DESC
                LIMIT 1
             )
          ${where}`,
        params,
      );
      const multiMemberships = await getMultiUserMemberships(pool);
      const memberPlanMemberships = await getMemberPlanMemberships(pool);
      const legacyPlanDescriptions = await getLegacyPlanDescriptions(pool);
      const enrichedMembers = rows.map((row: any) => {
        const member = mapMember(row);
        member.planDescription =
          legacyPlanDescriptions.get(member.currentPlan || "") || null;
        return enrichMemberWithSubscription(
          member,
          multiMemberships.get(member.id),
          memberPlanMemberships.get(member.id) || [],
        );
      });
      const currentPlans = Array.from(
        new Set<string>(
          enrichedMembers
            .flatMap((member: any) =>
              (member.plans || []).map((plan: any) =>
                normalizeString(plan.planName),
              ),
            )
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));
      const filteredMembers = enrichedMembers.filter((member: any) => {
        if (
          subscriptionStatusFilter &&
          !(member.plans || []).some((plan: any) => {
            const subscriptionStatus = normalizeString(plan.subscriptionStatus).toLowerCase();
            const affiliationStatus = normalizeString(plan.status).toLowerCase();
            const endDate = dateOnly(plan.endDate);
            if (subscriptionStatusFilter === "active") {
              return (
                subscriptionStatus === "active" &&
                affiliationStatus === "active" &&
                Boolean(endDate && endDate >= todayDateString())
              );
            }
            return subscriptionStatus === subscriptionStatusFilter;
          })
        ) {
          return false;
        }
        if (
          currentPlanFilter &&
          !(member.plans || []).some(
            (plan: any) =>
              normalizeString(plan.planName).toLowerCase() ===
              currentPlanFilter,
          )
        ) {
          return false;
        }
        const memberPaymentStatus =
          normalizeString(member.paymentStatus).toLowerCase();
        if (
          paymentStatusFilter === "paid" &&
          memberPaymentStatus !== "paid"
        ) {
          return false;
        }
        if (
          paymentStatusFilter === "pending" &&
          !["pending", "partial", "overdue"].includes(memberPaymentStatus)
        ) {
          return false;
        }
        if (
          expiryDateFilter &&
          !(member.plans || []).some(
            (plan: any) => dateOnly(plan.endDate) === expiryDateFilter,
          )
        ) {
          return false;
        }
        return true;
      });
      const sortValue = (member: any) => {
        if (sortBy.startsWith("expiry_")) {
          return dateOnly(member.currentExpiry) || "";
        }
        if (sortBy.startsWith("last_access_")) {
          return normalizeDate(member.lastAccess) || "";
        }
        return normalizeDate(member.joinDate) || "";
      };
      const sortDirection = sortBy.endsWith("_asc") ? 1 : -1;
      filteredMembers.sort((left: any, right: any) => {
        const leftValue = sortValue(left);
        const rightValue = sortValue(right);
        if (!leftValue && !rightValue) {
          return String(left.lastName || left.firstName || "").localeCompare(
            String(right.lastName || right.firstName || ""),
          );
        }
        if (!leftValue) return 1;
        if (!rightValue) return -1;
        const comparison = leftValue.localeCompare(rightValue);
        if (comparison !== 0) return comparison * sortDirection;
        return String(left.lastName || left.firstName || "").localeCompare(
          String(right.lastName || right.firstName || ""),
        );
      });
      const total = filteredMembers.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * pageSize;
      if (
        normalizeString(req.query.audit).toLowerCase() === "true"
      ) {
        await pool.query(
          `INSERT INTO audit_logs (action, details, performed_by)
           VALUES ('member_directory_filters_applied', ?, ?)`,
          [
            JSON.stringify({
              search: search || null,
              memberStatus: status || null,
              subscriptionStatus: subscriptionStatusFilter || null,
              currentPlan: currentPlanFilter || null,
              paymentStatus: paymentStatusFilter || null,
              expiryDate: expiryDateFilter || null,
              accessedToday,
              accessDate: accessDate || null,
              sortBy,
              page,
              pageSize,
              results: total,
            }),
            (req as AuthenticatedRequest).user?.email ||
              (req as AuthenticatedRequest).user?.uid ||
              "system",
          ],
        );
      }
      res.json({
        members: filteredMembers.slice(offset, offset + pageSize),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
        summary: {
          total,
          active: filteredMembers.filter(
            (member: any) => member.status === "active",
          ).length,
          archived: filteredMembers.filter(
            (member: any) => member.status === "archived",
          ).length,
        },
        filterOptions: {
          currentPlans,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/membership/members", requirePermission("membership.write"), async (req, res, next) => {
    try {
      const firstName = normalizeString(req.body.firstName);
      const lastName = normalizeString(req.body.lastName);
      const email = normalizeEmail(req.body.email);
      const phone = normalizeString(req.body.phone);
      const status = normalizeString(req.body.status) || "inactive";
      const joinDate = normalizeDate(req.body.joinDate) || todayDate();
      const currentPlan = normalizeString(req.body.currentPlan || req.body.plan);

      if (!firstName) return res.status(400).json({ error: "firstName is required" });
      if (!lastName) return res.status(400).json({ error: "lastName is required" });
      if (!email) return res.status(400).json({ error: "email is required" });

      const pool = await getReadyPool();
      const id = normalizeString(req.body.id) || createId("mem");
      await pool.query(
        `INSERT INTO members (id, first_name, last_name, email, phone, status, join_date, plan, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, firstName, lastName, email, phone || null, status, joinDate, currentPlan || null, toMysqlJson(req.body.data)],
      );
      const [rows]: any = await pool.query("SELECT * FROM members WHERE id = ?", [id]);
      res.status(201).json({ member: mapMember(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/membership/members/:id", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [rows]: any = await pool.query(`SELECT m.*, current_subscription.current_expiry,
                  legacy_subscription.id AS legacy_subscription_id,
                  legacy_invoice.id AS payment_invoice_id,
                  legacy_invoice.status AS payment_invoice_status,
                  legacy_invoice.due_date AS payment_due_date
           FROM members m
           LEFT JOIN (
             SELECT member_id, MAX(end_date) AS current_expiry
               FROM member_subscriptions
              WHERE LOWER(TRIM(status)) = 'active'
              GROUP BY member_id
           ) current_subscription ON current_subscription.member_id = m.id
           LEFT JOIN member_subscriptions legacy_subscription
             ON legacy_subscription.id = (
               SELECT ms_latest.id
                 FROM member_subscriptions ms_latest
                WHERE ms_latest.member_id = m.id
                ORDER BY
                  (LOWER(TRIM(ms_latest.status)) = 'active') DESC,
                  ms_latest.end_date DESC,
                  ms_latest.created_at DESC
                LIMIT 1
             )
           LEFT JOIN invoices legacy_invoice
             ON legacy_invoice.id = (
               SELECT i_latest.id
                 FROM invoices i_latest
                WHERE i_latest.subscription_id = legacy_subscription.id
                ORDER BY i_latest.created_at DESC
                LIMIT 1
             )
          WHERE m.id = ?`, [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: "Member not found" });

      const [subs]: any = await pool.query(
        "SELECT * FROM member_subscriptions WHERE member_id = ? ORDER BY start_date DESC",
        [req.params.id],
      );
      const [invoices]: any = await pool.query(
        "SELECT * FROM invoices WHERE member_id = ? ORDER BY created_at DESC LIMIT 50",
        [req.params.id],
      );
      const multiMemberships = await getMultiUserMemberships(pool, req.params.id);
      const memberPlanMemberships = await getMemberPlanMemberships(
        pool,
        req.params.id,
        true,
      );
      const member = mapMember(rows[0]);
      const legacyPlanDescriptions = await getLegacyPlanDescriptions(pool);
      member.planDescription =
        legacyPlanDescriptions.get(member.currentPlan || "") || null;

      res.json({
        member: enrichMemberWithSubscription(
          member,
          multiMemberships.get(member.id),
          memberPlanMemberships.get(member.id) || [],
        ),
        subscriptions: subs.map(mapSubscription),
        invoices: invoices.map(mapInvoice),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/membership/members/:id/session-history.pdf", requirePermission("membership.read"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getReadyPool();
      const [memberRows]: any = await pool.query(
        "SELECT id, first_name, last_name, email FROM members WHERE id = ? LIMIT 1",
        [req.params.id],
      );
      if (!memberRows.length) return res.status(404).json({ error: "Member not found" });
      const member = memberRows[0];

      const [planRows]: any = await pool.query(
        `SELECT pv.name AS plan_name, pv.trainer_name,
                a.start_date, a.end_date, a.status AS affiliation_status,
                s.status AS subscription_status,
                COALESCE(SUM(
                  sb.included + sb.carried_over + sb.purchased +
                  sb.adjustments_positive + sb.refunds
                ), 0) AS sessions_contracted,
                COALESCE(SUM(sb.consumed + sb.adjustments_negative), 0) AS sessions_consumed,
                COALESCE(SUM(sb.reserved), 0) AS sessions_reserved,
                COALESCE(SUM(sb.available), 0) AS sessions_remaining
           FROM affiliations a
           JOIN subscriptions s ON s.id = a.subscription_id
           JOIN plan_versions pv ON pv.id = a.plan_version_id
           LEFT JOIN subscription_cycles sc ON sc.subscription_id = s.id
           LEFT JOIN session_balances sb
             ON sb.cycle_id = sc.id
            AND (
              (pv.distribution_model = 'shared'
               AND sb.context_type = 'subscription' AND sb.context_id = s.id)
              OR
              (pv.distribution_model <> 'shared'
               AND sb.context_type = 'affiliation' AND sb.context_id = a.id)
            )
          WHERE a.member_id = ?
            AND pv.sessions_unlimited = 0
            AND pv.trainer_id IS NOT NULL
          GROUP BY pv.name, pv.trainer_name, a.id, a.start_date, a.end_date,
                   a.status, s.status
          ORDER BY a.start_date DESC, a.end_date DESC`,
        [req.params.id],
      );
      if (!planRows.length) {
        return res.status(404).json({
          error: "This member has no current or historical limited-session plan with an assigned trainer",
        });
      }

      const [movementRows]: any = await pool.query(
        `SELECT COALESCE(ps.start_time, cs.start_time, sm.created_at) AS session_datetime,
                pv.name AS plan_name,
                COALESCE(
                  NULLIF(ps.trainer_name, ''),
                  NULLIF(cs.trainer_name, ''),
                  NULLIF(pv.trainer_name, ''),
                  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(sm.data, '$.trainerName')), ''),
                  'Not recorded'
                ) AS trainer_name,
                CASE
                  WHEN ps.id IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, ps.start_time, ps.end_time)
                  WHEN cs.id IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, cs.start_time, cs.end_time)
                  ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(sm.data, '$.durationMinutes')) AS UNSIGNED)
                END AS duration_minutes,
                CASE
                  WHEN ps.id IS NOT NULL THEN 'Private PT'
                  WHEN cs.id IS NOT NULL THEN 'Group class'
                  WHEN sm.reference_type = 'access_attempt' THEN 'Access control'
                  ELSE COALESCE(NULLIF(sm.reference_type, ''), 'Manual')
                END AS session_source,
                ABS(sm.quantity) AS quantity,
                CASE WHEN EXISTS (
                  SELECT 1 FROM session_movements reversal
                   WHERE reversal.related_movement_id = sm.id
                     AND reversal.direction = '+'
                     AND reversal.movement_type IN ('refund', 'adjustment_positive', 'release')
                ) THEN 'Recovered' ELSE 'Consumed' END AS movement_status
           FROM session_movements sm
           JOIN affiliations a ON a.id = sm.affiliation_id
           JOIN subscriptions s ON s.id = a.subscription_id
           JOIN plan_versions pv ON pv.id = a.plan_version_id
           LEFT JOIN private_sessions ps
             ON sm.reference_id = ps.id
            AND sm.reference_type IN ('private_session', 'private_pt', 'private_class')
           LEFT JOIN class_bookings cb
             ON sm.reference_id = cb.id
            AND sm.reference_type IN ('class_booking', 'booking')
           LEFT JOIN class_sessions cs ON cs.id = cb.class_id
          WHERE a.member_id = ?
            AND pv.sessions_unlimited = 0
            AND pv.trainer_id IS NOT NULL
            AND sm.direction = '-'
            AND sm.movement_type IN ('consumption', 'adjustment_negative')
          ORDER BY session_datetime DESC`,
        [req.params.id],
      );

      const [pendingRows]: any = await pool.query(
        `SELECT pv.name AS plan_name, pv.trainer_name,
                sc.start_date, sc.end_date, sc.status AS cycle_status,
                sb.included, sb.carried_over, sb.purchased, sb.consumed,
                sb.reserved, sb.available
           FROM affiliations a
           JOIN subscriptions s ON s.id = a.subscription_id
           JOIN plan_versions pv ON pv.id = a.plan_version_id
           JOIN subscription_cycles sc ON sc.subscription_id = s.id
           JOIN session_balances sb
             ON sb.cycle_id = sc.id
            AND (
              (pv.distribution_model = 'shared'
               AND sb.context_type = 'subscription' AND sb.context_id = s.id)
              OR
              (pv.distribution_model <> 'shared'
               AND sb.context_type = 'affiliation' AND sb.context_id = a.id)
            )
          WHERE a.member_id = ?
            AND pv.sessions_unlimited = 0
            AND pv.trainer_id IS NOT NULL
            AND sb.available > 0
          ORDER BY sc.end_date DESC`,
        [req.params.id],
      );

      const memberName = `${member.first_name || ""} ${member.last_name || ""}`.trim();
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(18);
      doc.text("Member plan and session history", 36, 36);
      doc.setFontSize(10);
      doc.text(`Member: ${memberName}`, 36, 54);
      doc.text(`Generated: ${new Date().toISOString()}`, 36, 69);

      autoTable(doc, {
        startY: 86,
        head: [["Plan", "Responsible trainer", "Start", "End", "Status", "Contracted", "Consumed", "Reserved", "Remaining"]],
        body: planRows.map((row: any) => [
          row.plan_name, row.trainer_name || "Not recorded",
          formatDisplayDate(row.start_date), formatDisplayDate(row.end_date),
          `${row.subscription_status} / ${row.affiliation_status}`,
          Number(row.sessions_contracted || 0), Number(row.sessions_consumed || 0),
          Number(row.sessions_reserved || 0), Number(row.sessions_remaining || 0),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [43, 43, 43] },
      });

      autoTable(doc, {
        startY: Number((doc as any).lastAutoTable?.finalY || 86) + 24,
        head: [["Session date & time", "Plan", "Trainer", "Duration", "Source", "Quantity", "Status"]],
        body: movementRows.length
          ? movementRows.map((row: any) => [
              row.session_datetime ? new Date(row.session_datetime).toLocaleString("en-GB") : "Not recorded",
              row.plan_name, row.trainer_name,
              row.duration_minutes ? `${row.duration_minutes} min` : "Not recorded",
              row.session_source, Number(row.quantity || 0), row.movement_status,
            ])
          : [["No consumed sessions recorded", "", "", "", "", "", ""]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [43, 43, 43] },
      });

      autoTable(doc, {
        startY: Number((doc as any).lastAutoTable?.finalY || 86) + 24,
        head: [["Unconsumed sessions by cycle", "Trainer", "Cycle start", "Cycle expiry", "Cycle status", "Included", "Carried", "Purchased", "Consumed", "Reserved", "Remaining"]],
        body: pendingRows.length
          ? pendingRows.map((row: any) => [
              row.plan_name, row.trainer_name || "Not recorded",
              formatDisplayDate(row.start_date), formatDisplayDate(row.end_date),
              row.cycle_status, Number(row.included || 0), Number(row.carried_over || 0),
              Number(row.purchased || 0), Number(row.consumed || 0),
              Number(row.reserved || 0), Number(row.available || 0),
            ])
          : [["No unconsumed sessions remain", "", "", "", "", "", "", "", "", "", ""]],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [43, 43, 43] },
      });

      await pool.query(
        "INSERT INTO audit_logs (action, details, performed_by) VALUES ('member_session_history_pdf_exported', ?, ?)",
        [
          JSON.stringify({
            memberId: req.params.id,
            plans: planRows.length,
            consumedSessionRows: movementRows.length,
            pendingCycleRows: pendingRows.length,
          }),
          req.user?.email || req.user?.uid || "system",
        ],
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="PowerGym_Session_History_${memberName.replace(/[^A-Za-z0-9_-]/g, "_") || "member"}.pdf"`,
      );
      res.send(pdfArrayBufferToBuffer(doc));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/membership/members/:id", requirePermission("membership.write"), async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [existing]: any = await pool.query("SELECT * FROM members WHERE id = ?", [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ error: "Member not found" });

      const current = mapMember(existing[0]);
      const firstName = normalizeString(req.body.firstName) || current.firstName;
      const lastName = normalizeString(req.body.lastName) || current.lastName;
      const email = normalizeEmail(req.body.email) || current.email;
      const phone = req.body.phone === undefined ? current.phone : normalizeString(req.body.phone);
      const requestedStatus = normalizeString(req.body.status).toLowerCase();
      const status = requestedStatus || existing[0].status || current.status;
      const joinDate = normalizeDate(req.body.joinDate) || current.joinDate;
      const currentPlan = req.body.currentPlan === undefined && req.body.plan === undefined
        ? current.currentPlan
        : normalizeString(req.body.currentPlan || req.body.plan);

      if (requestedStatus && requestedStatus !== "active") {
        await assertMemberCanBeRestricted(pool, req.params.id);
      }

      await pool.query(
        `UPDATE members
         SET first_name = ?, last_name = ?, email = ?, phone = ?, status = ?, join_date = ?, plan = ?, data = ?
         WHERE id = ?`,
        [firstName, lastName, email, phone || null, status, joinDate, currentPlan || null, toMysqlJson(req.body.data ?? current.data), req.params.id],
      );
      const [rows]: any = await pool.query("SELECT * FROM members WHERE id = ?", [req.params.id]);
      res.json({ member: mapMember(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/membership/members/:id", requirePermission("membership.write"), async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      await assertMemberCanBeRestricted(pool, req.params.id);
      await pool.query("UPDATE members SET status = 'archived' WHERE id = ?", [req.params.id]);
      res.json({ success: true, status: "archived" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/membership/members/:id/subscriptions", requirePermission("membership.write"), async (req, res, next) => {
    const pool = await getReadyPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [members]: any = await connection.query("SELECT * FROM members WHERE id = ?", [req.params.id]);
      if (members.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Member not found" });
      }
      const [outstandingInvoices]: any = await connection.query(
        `SELECT i.id, i.invoice_number, i.status
           FROM invoices i
           JOIN member_subscriptions ms ON ms.id = i.subscription_id
          WHERE ms.member_id = ?
            AND LOWER(TRIM(i.status)) NOT IN ('paid', 'cancelled', 'void')
          ORDER BY i.created_at DESC
          LIMIT 1`,
        [req.params.id],
      );
      const confirmOutstandingPayment =
        req.body.confirmOutstandingPayment === true;
      if (outstandingInvoices.length && !confirmOutstandingPayment) {
        await connection.rollback();
        return res.status(409).json({
          error: `Outstanding payment for invoice ${outstandingInvoices[0].invoice_number} must be explicitly confirmed before renewal`,
          code: "OUTSTANDING_SUBSCRIPTION_PAYMENT",
          invoiceId: outstandingInvoices[0].id,
          confirmationRequired: true,
        });
      }

      const planId = normalizeString(req.body.planId);
      const [plans]: any = planId
        ? await connection.query("SELECT * FROM subscription_plans WHERE id = ?", [planId])
        : [[]];
      const plan = plans[0] ? mapPlan(plans[0]) : null;

      const planName = normalizeString(req.body.planName) || plan?.name || "Custom plan";
      const [currentSubscriptionRows]: any = await connection.query(
        `SELECT id, end_date FROM member_subscriptions
         WHERE member_id = ? AND status = 'active'
         ORDER BY end_date DESC
         LIMIT 1`,
        [req.params.id],
      );
      const automaticStartDate = deriveRenewalStartDate(currentSubscriptionRows[0]?.end_date);
      const startDate = normalizeDate(req.body.startDate) || automaticStartDate;
      const durationDays = numberOrDefault(req.body.durationDays, plan?.durationDays || 30);
      const endDate = normalizeDate(req.body.endDate) || addDays(startDate, durationDays);
      const price = numberOrDefault(req.body.price, plan?.price || 0);
      const currency = normalizeString(req.body.currency) || plan?.currency || "USD";
      const subscriptionId = createId("sub");
      const previousSubscriptionId =
        currentSubscriptionRows[0]?.id || null;
      const subscriptionData = {
        ...parseJsonField(req.body.data),
        source: previousSubscriptionId ? "renewal" : "subscription",
        renewalOfSubscriptionId: previousSubscriptionId,
      };
      const paymentStatus = normalizeString(req.body.paymentStatus).toLowerCase();
      if (!["paid", "pending"].includes(paymentStatus)) {
        await connection.rollback();
        return res.status(400).json({
          error: "paymentStatus is required and must be paid or pending",
        });
      }
      const requestedPaymentDate = normalizeDate(req.body.paymentDate);
      const paymentDate =
        paymentStatus === "paid" ? todayDate() : requestedPaymentDate;
      if (!paymentDate) {
        await connection.rollback();
        return res.status(400).json({
          error: "An estimated payment date is required for pending payments",
        });
      }

      if (new Date(endDate) < new Date(startDate)) {
        await connection.rollback();
        return res.status(400).json({ error: "endDate must be after startDate" });
      }
      if (paymentStatus === "pending" && paymentDate > endDate) {
        await connection.rollback();
        return res.status(400).json({
          error: "The estimated payment date cannot be after the subscription end date",
        });
      }
      if (paymentStatus === "pending" && paymentDate < todayDate()) {
        await connection.rollback();
        return res.status(400).json({
          error: "The estimated payment date cannot be in the past",
        });
      }

      await connection.query(
        "UPDATE member_subscriptions SET status = 'replaced' WHERE member_id = ? AND status = 'active'",
        [req.params.id],
      );
      await connection.query(
        `INSERT INTO member_subscriptions
         (id, member_id, plan_id, plan_name, status, start_date, end_date, price, currency, data)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
        [subscriptionId, req.params.id, planId || null, planName, startDate, endDate, price, currency, toMysqlJson(subscriptionData)],
      );
      await connection.query(
        "UPDATE members SET plan = ?, status = 'active' WHERE id = ?",
        [planName, req.params.id],
      );

      let invoice: any = null;
      if (req.body.createInvoice !== false) {
        const invoiceId = createId("inv");
        const invoiceNumber = makeInvoiceNumber();
        const taxAmount = numberOrDefault(req.body.taxAmount, 0);
        const total = price + taxAmount;
        await connection.query(
          `INSERT INTO invoices
           (id, invoice_number, member_id, subscription_id, status, subtotal, tax_amount, total, currency, due_date, paid_at, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            invoiceNumber,
            req.params.id,
            subscriptionId,
            paymentStatus === "paid" ? "paid" : "issued",
            price,
            taxAmount,
            total,
            currency,
            paymentDate,
            paymentStatus === "paid" ? new Date() : null,
            toMysqlJson({
              source: "subscription",
              renewalOfSubscriptionId: previousSubscriptionId,
              paymentStatus,
              expectedPaymentDate:
                paymentStatus === "pending" ? paymentDate : null,
              ...(req.body.invoiceData || {}),
            }),
          ],
        );
        await insertMembershipRenewalFinanceTransaction(connection, {
          invoiceId,
          invoiceNumber,
          memberId: req.params.id,
          subscriptionId,
          memberName: `${members[0].first_name || ""} ${members[0].last_name || ""}`.trim() || req.params.id,
          planName,
          total,
          currency,
          date: paymentDate,
          status: paymentStatus === "paid" ? "posted" : "pending",
          userEmail: (req as AuthenticatedRequest).user?.email,
        });
        const [invoiceRows]: any = await connection.query("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
        invoice = mapInvoice(invoiceRows[0]);
      }

      if (outstandingInvoices.length) {
        await connection.query(
          `INSERT INTO audit_logs (action, details, performed_by)
           VALUES ('subscription_renewed_with_outstanding_payment', ?, ?)`,
          [
            JSON.stringify({
              memberId: req.params.id,
              renewedSubscriptionId: subscriptionId,
              previousInvoiceId: outstandingInvoices[0].id,
              previousInvoiceNumber:
                outstandingInvoices[0].invoice_number,
              newInvoiceNumber: invoice?.invoiceNumber || null,
              operatorConfirmation: true,
            }),
            (req as AuthenticatedRequest).user?.email ||
              (req as AuthenticatedRequest).user?.uid ||
              "system",
          ],
        );
      }

      const [subscriptionRows]: any = await connection.query("SELECT * FROM member_subscriptions WHERE id = ?", [subscriptionId]);
      await connection.commit();
      res.status(201).json({ subscription: mapSubscription(subscriptionRows[0]), invoice });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.get("/api/membership/members/:id/subscriptions", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [rows]: any = await pool.query(
        "SELECT * FROM member_subscriptions WHERE member_id = ? ORDER BY start_date DESC",
        [req.params.id],
      );
      res.json({ subscriptions: rows.map(mapSubscription) });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/membership/subscriptions/:id/payment-status", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = await getReadyPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const paymentStatus = normalizeString(req.body.paymentStatus).toLowerCase();
      if (!["paid", "pending"].includes(paymentStatus)) {
        await connection.rollback();
        return res.status(400).json({
          error: "paymentStatus must be paid or pending",
        });
      }

      const [subscriptionRows]: any = await connection.query(
        `SELECT ms.*, m.first_name, m.last_name
           FROM member_subscriptions ms
           JOIN members m ON m.id = ms.member_id
          WHERE ms.id = ?
          LIMIT 1
          FOR UPDATE`,
        [req.params.id],
      );
      if (!subscriptionRows.length) {
        await connection.rollback();
        return res.status(404).json({ error: "Subscription not found" });
      }
      const subscription = subscriptionRows[0];
      const [invoiceRows]: any = await connection.query(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [req.params.id],
      );
      if (
        String(invoiceRows[0]?.status || "").toLowerCase() === "paid" &&
        paymentStatus !== "paid"
      ) {
        await connection.rollback();
        return res.status(409).json({
          error: "A paid subscription payment status is locked",
          code: "PAID_SUBSCRIPTION_LOCKED",
        });
      }

      const endDate = dateOnly(subscription.end_date) || todayDate();
      const requestedDate = normalizeDate(req.body.paymentDate);
      const paymentDate =
        paymentStatus === "paid"
          ? todayDate()
          : requestedDate || dateOnly(invoiceRows[0]?.due_date) || todayDate();
      if (paymentStatus === "pending" && paymentDate > endDate) {
        await connection.rollback();
        return res.status(400).json({
          error: "The estimated payment date cannot be after the subscription end date",
        });
      }
      if (paymentStatus === "pending" && paymentDate < todayDate()) {
        await connection.rollback();
        return res.status(400).json({
          error: "The estimated payment date cannot be in the past",
        });
      }

      let invoiceId = invoiceRows[0]?.id;
      if (!invoiceId) {
        invoiceId = createId("inv");
        await connection.query(
          `INSERT INTO invoices
            (id, invoice_number, member_id, subscription_id, status,
             subtotal, tax_amount, total, currency, due_date, paid_at, data)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            makeInvoiceNumber(),
            subscription.member_id,
            subscription.id,
            paymentStatus === "paid" ? "paid" : "issued",
            Number(subscription.price || 0),
            Number(subscription.price || 0),
            subscription.currency || "USD",
            paymentDate,
            paymentStatus === "paid" ? new Date() : null,
            toMysqlJson({
              source: "subscription",
              paymentStatus,
              expectedPaymentDate:
                paymentStatus === "pending" ? paymentDate : null,
            }),
          ],
        );
      } else {
        await connection.query(
          `UPDATE invoices
              SET status = ?,
                  due_date = ?,
                  paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END,
                  data = JSON_SET(
                    COALESCE(data, JSON_OBJECT()),
                    '$.paymentStatus', ?,
                    '$.expectedPaymentDate', ?
                  ),
                  updated_at = NOW()
            WHERE id = ?`,
          [
            paymentStatus === "paid" ? "paid" : "issued",
            paymentDate,
            paymentStatus,
            paymentStatus,
            paymentStatus === "pending" ? paymentDate : null,
            invoiceId,
          ],
        );
      }

      const [updatedInvoiceRows]: any = await connection.query(
        "SELECT * FROM invoices WHERE id = ?",
        [invoiceId],
      );
      const invoice = updatedInvoiceRows[0];
      await insertMembershipRenewalFinanceTransaction(connection, {
        invoiceId,
        invoiceNumber: invoice.invoice_number,
        memberId: subscription.member_id,
        subscriptionId: subscription.id,
        memberName:
          `${subscription.first_name || ""} ${subscription.last_name || ""}`.trim() ||
          subscription.member_id,
        planName: subscription.plan_name || "Membership payment",
        total: Number(invoice.total || 0),
        currency: invoice.currency || "USD",
        date: paymentDate,
        status: paymentStatus === "paid" ? "posted" : "pending",
        userEmail: req.user?.email,
      });
      await connection.commit();
      res.json({
        paymentStatus,
        paymentStatusLocked: paymentStatus === "paid",
        invoice: mapInvoice(invoice),
      });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.get("/api/membership/invoices", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const status = normalizeString(req.query.status);
      const memberId = normalizeString(req.query.memberId);
      const filters: string[] = [];
      const params: any[] = [];
      if (status) {
        filters.push("status = ?");
        params.push(status);
      }
      if (memberId) {
        filters.push("member_id = ?");
        params.push(memberId);
      }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT 500`,
        params,
      );
      res.json({ invoices: rows.map(mapInvoice) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/membership/invoices/:id/receipt.pdf", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [invoiceRows]: any = await pool.query("SELECT * FROM invoices WHERE id = ?", [req.params.id]);
      if (invoiceRows.length === 0) return res.status(404).json({ error: "Invoice not found" });
      const invoice = invoiceRows[0];
      const [memberRows]: any = await pool.query("SELECT * FROM members WHERE id = ?", [invoice.member_id]);
      const [subscriptionRows]: any = await pool.query("SELECT * FROM member_subscriptions WHERE id = ?", [invoice.subscription_id]);
      const pdf = buildReceiptPdf(invoice, memberRows[0] || null, subscriptionRows[0] || null);
      const fileName = `PowerGym_Receipt_${String(invoice.invoice_number || invoice.id).replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/membership/invoices/:id/mark-paid", requirePermission("membership.write"), async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      await pool.query("UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?", [req.params.id]);
      const [rows]: any = await pool.query("SELECT * FROM invoices WHERE id = ?", [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: "Invoice not found" });
      const invoice = rows[0];
      const [memberRows]: any = await pool.query("SELECT * FROM members WHERE id = ?", [invoice.member_id]);
      const [subscriptionRows]: any = await pool.query("SELECT * FROM member_subscriptions WHERE id = ?", [invoice.subscription_id]);
      await insertMembershipRenewalFinanceTransaction(pool as any, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        memberId: invoice.member_id,
        subscriptionId: invoice.subscription_id || "",
        memberName: `${memberRows[0]?.first_name || ""} ${memberRows[0]?.last_name || ""}`.trim() || invoice.member_id,
        planName: subscriptionRows[0]?.plan_name || "Membership payment",
        total: Number(invoice.total || 0),
        currency: invoice.currency || "USD",
        date: normalizeDate(invoice.paid_at) || normalizeDate(invoice.due_date) || todayDate(),
        userEmail: (req as AuthenticatedRequest).user?.email,
      });
      res.json({ invoice: mapInvoice(invoice) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/membership/members/:id/access-token", requirePermission("membership.ecard.generate"), async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [members]: any = await pool.query("SELECT * FROM members WHERE id = ? AND LOWER(TRIM(status)) = 'active'", [req.params.id]);
      if (members.length === 0) return res.status(404).json({ error: "Active member not found" });

      const subscription = await loadCurrentEcardSubscription(pool, req.params.id);
      if (!subscription) {
        return res.status(400).json({ error: "Member has no active subscription expiry date for QR e-card" });
      }

      const token = crypto.randomBytes(32).toString("base64url");
      const expiryDate = normalizeDate(subscription.end_date);
      const expiresAt = expiryDate ? `${expiryDate} 23:59:59` : null;
      const id = createId("tok");
      await pool.query(
        `INSERT INTO access_tokens (id, member_id, token_hash, status, expires_at, data)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        [id, req.params.id, hashToken(token), expiresAt, toMysqlJson({ createdBy: (req as AuthenticatedRequest).user?.email || "system", source: "subscription_expiry", subscriptionId: subscription.id })],
      );
      res.status(201).json({ token, tokenId: id, memberId: req.params.id, expiresAt, expiryDate, planName: subscription.plan_name });
    } catch (error) {
      next(error);
    }
  });


  app.post(
    "/api/membership/members/:id/ecard/pdf",
    requirePermission("membership.ecard.generate"),
    validateBody(ecardPdfSchema),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const pool = await getReadyPool();
        const token = normalizeString(req.body.token);
        const tokenId = normalizeString(req.body.tokenId);
        const qrImageData = assertQrImageData(req.body.qrImageData);
        const { member, subscription } = await loadValidatedEcardData(pool, { memberId: req.params.id, token, tokenId });
        const pdf = await buildEcardPdfBuffer(pool, { member, subscription, token, qrImageData });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${pdf.fileName}"`);
        res.send(pdf.buffer);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/membership/members/:id/ecard/deliver",
    requirePermission("membership.ecard.generate"),
    validateBody(ecardDeliverySchema),
    async (req: AuthenticatedRequest, res, next) => {
      const deliveryId = createId("ecard_delivery");
      let deliveryLogCreated = false;
      try {
        const pool = await getReadyPool();
        const channel = normalizeString(req.body.channel).toLowerCase();
        const token = normalizeString(req.body.token);
        const tokenId = normalizeString(req.body.tokenId);
        const qrImageData = assertQrImageData(req.body.qrImageData);
        const { member, subscription } = await loadValidatedEcardData(pool, { memberId: req.params.id, token, tokenId });
        const mappedMember = mapMember(member);
        const recipient = channel === "email" ? normalizeEmail(req.body.email || mappedMember.email) : normalizeString(req.body.phone || mappedMember.phone).replace(/\D/g, "");

        if (channel === "email" && !recipient) return res.status(400).json({ error: "Member email is required for e-card delivery" });
        if (channel === "whatsapp" && !recipient) return res.status(400).json({ error: "Member WhatsApp phone number is required for e-card delivery" });
        if (channel === "whatsapp" && !isEcardWhatsAppConfigured()) {
          return res.status(501).json({
            error: getEcardWhatsAppConfigurationError(),
            code: "WHATSAPP_PROVIDER_NOT_CONFIGURED",
          });
        }

        const pdf = await buildEcardPdfBuffer(pool, { member, subscription, token, qrImageData });
        const text = `Dear ${pdf.memberName},

Attached is your PowerGym QR e-Card PDF.
Plan: ${pdf.planName}
Expiry Date: ${pdf.expiryDate}

Please present the QR code at reception for access validation.`;
        await pool.query(
          `INSERT INTO ecard_delivery_logs (id, member_id, token_id, channel, recipient, status, data)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
          [deliveryId, req.params.id, tokenId, channel, recipient, toMysqlJson({ createdBy: req.user?.email || req.user?.uid || "system" })],
        );
        deliveryLogCreated = true;

        if (channel === "email") {
          await sendEcardByEmail({
            to: recipient,
            from: process.env.ECARD_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || process.env.ADMIN_EMAIL || recipient,
            subject: "Your PowerGym QR e-Card",
            text,
            pdfBuffer: pdf.buffer,
            fileName: pdf.fileName,
          });
        } else {
          await sendEcardByWhatsApp({
            toPhone: recipient,
            caption: `PowerGym QR e-Card for ${pdf.memberName} - expires ${pdf.expiryDate}`,
            pdfBuffer: pdf.buffer,
            fileName: pdf.fileName,
          });
        }

        await pool.query("UPDATE ecard_delivery_logs SET status = 'sent' WHERE id = ?", [deliveryId]);
        res.json({ success: true, channel, recipient, fileName: pdf.fileName });
      } catch (error) {
        try {
          const pool = poolProvider();
          if (pool && deliveryLogCreated) await pool.query("UPDATE ecard_delivery_logs SET status = 'failed', error_message = ? WHERE id = ?", [(error as any)?.message || String(error), deliveryId]);
        } catch {}
        next(error);
      }
    },
  );

  app.post("/api/membership/validate-access", requirePermission("membership.access.validate"), validateBody(validateAccessSchema), async (req, res, next) => {
    try {
      const token = normalizeString(req.body.token);
      if (!token) return res.status(400).json({ error: "token is required" });

      const pool = await getReadyPool();
      const [tokens]: any = await pool.query(
        `SELECT * FROM access_tokens
         WHERE token_hash = ?
           AND status = 'active'
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at >= NOW())
         LIMIT 1`,
        [hashToken(token)],
      );
      if (tokens.length === 0) {
        return res.status(403).json({ valid: false, reason: "Invalid or expired token" });
      }

      const memberId = tokens[0].member_id;
      const [members]: any = await pool.query("SELECT * FROM members WHERE id = ? AND LOWER(TRIM(status)) = 'active'", [memberId]);
      if (members.length === 0) {
        return res.status(403).json({ valid: false, reason: "Member inactive or not found" });
      }

      const subscription = await loadCurrentEcardSubscription(pool, memberId);

      if (!subscription) {
        return res.status(403).json({ valid: false, reason: "No active subscription", member: mapMember(members[0]) });
      }

      await pool.query("UPDATE members SET last_access_at = NOW() WHERE id = ?", [memberId]);
      const [updatedMembers]: any = await pool.query("SELECT * FROM members WHERE id = ?", [memberId]);

      return res.json({
        valid: true,
        member: mapMember(updatedMembers[0] || members[0]),
        subscription: mapSubscription(subscription),
      });
    } catch (error) {
      next(error);
    }
  });
}
