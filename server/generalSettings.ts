import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { requirePermission, type AuthenticatedRequest } from "./rbac";

export type GeneralSettings = {
  gymName: string;
  staffRoles: string[];
  departments: string[];
  rooms: string[];
  ecardTitle: string;
  ecardNote: string;
  ecardBackgroundImage: string;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  gymName: "POWERPULSE GYM",
  staffRoles: ["admin", "manager", "reception", "cashier", "trainer", "accounting", "warehouse_manager", "hr", "support"],
  departments: ["Sales", "Management", "Training", "Operations", "Finance"],
  rooms: ["Personal Training Area", "Sala A", "Sala B", "Box Exterior"],
  ecardTitle: "PowerGym QR e-Card",
  ecardNote: "Present this QR e-card at reception for access validation.",
  ecardBackgroundImage: "",
};

const STRING_LIMITS = {
  gymName: 200,
  ecardTitle: 200,
  ecardNote: 1000,
  ecardBackgroundImage: 900000,
} as const;

const ARRAY_LIMITS = {
  staffRoles: { items: 50, itemLength: 100 },
  departments: { items: 100, itemLength: 120 },
  rooms: { items: 100, itemLength: 160 },
} as const;

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedString(value: unknown, field: keyof typeof STRING_LIMITS) {
  if (typeof value !== "string") {
    throw Object.assign(new Error(`${field} must be a string`), { status: 400 });
  }
  const normalized = value.trim();
  if (normalized.length > STRING_LIMITS[field]) {
    throw Object.assign(new Error(`${field} exceeds the maximum length`), { status: 400 });
  }
  return normalized;
}

function normalizedStringArray(value: unknown, field: keyof typeof ARRAY_LIMITS) {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error(`${field} must be an array of strings`), { status: 400 });
  }
  const limits = ARRAY_LIMITS[field];
  if (value.length > limits.items) {
    throw Object.assign(new Error(`${field} contains too many items`), { status: 400 });
  }
  const items = value.map((item) => {
    if (typeof item !== "string") {
      throw Object.assign(new Error(`${field} must contain only strings`), { status: 400 });
    }
    const normalized = item.trim();
    if (!normalized || normalized.length > limits.itemLength) {
      throw Object.assign(new Error(`${field} contains an invalid item`), { status: 400 });
    }
    return normalized;
  });
  return [...new Set(items)];
}

export function normalizeGeneralSettingsPatch(value: unknown): Partial<GeneralSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Settings body must be an object"), { status: 400 });
  }
  const input = value as Record<string, unknown>;
  const patch: Partial<GeneralSettings> = {};

  for (const field of Object.keys(STRING_LIMITS) as Array<keyof typeof STRING_LIMITS>) {
    if (Object.prototype.hasOwnProperty.call(input, field)) patch[field] = normalizedString(input[field], field);
  }
  for (const field of Object.keys(ARRAY_LIMITS) as Array<keyof typeof ARRAY_LIMITS>) {
    if (Object.prototype.hasOwnProperty.call(input, field)) patch[field] = normalizedStringArray(input[field], field);
  }
  if (Object.keys(patch).length === 0) {
    throw Object.assign(new Error("No supported settings fields were provided"), { status: 400 });
  }
  return patch;
}

export function mergeGeneralSettings(value: unknown): GeneralSettings {
  const stored = parseJsonObject(value);
  const merged: GeneralSettings = { ...DEFAULT_GENERAL_SETTINGS };
  for (const field of Object.keys(STRING_LIMITS) as Array<keyof typeof STRING_LIMITS>) {
    if (typeof stored[field] === "string") merged[field] = stored[field] as never;
  }
  for (const field of Object.keys(ARRAY_LIMITS) as Array<keyof typeof ARRAY_LIMITS>) {
    if (Array.isArray(stored[field]) && stored[field]!.every((item) => typeof item === "string")) {
      merged[field] = stored[field] as never;
    }
  }
  return merged;
}

function requirePool(getPool: () => Pool | null) {
  const pool = getPool();
  if (!pool) throw Object.assign(new Error("Database unavailable"), { status: 503 });
  return pool;
}

async function readGeneralSettings(pool: Pool) {
  const [rows]: any = await pool.query("SELECT data FROM settings WHERE id = ? LIMIT 1", ["general"]);
  return mergeGeneralSettings(rows?.[0]?.data);
}

export function registerGeneralSettingsRoutes(app: Express, getPool: () => Pool | null) {
  app.get("/api/settings/general", requirePermission("records.settings.read"), async (_req: AuthenticatedRequest, res, next) => {
    try {
      res.json({ settings: await readGeneralSettings(requirePool(getPool)) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings/general", requirePermission("records.settings.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(getPool);
      const patch = normalizeGeneralSettingsPatch(req.body);
      await pool.query(
        `INSERT INTO settings (id, data)
         VALUES ('general', ?)
         ON DUPLICATE KEY UPDATE
           data = JSON_MERGE_PATCH(COALESCE(data, JSON_OBJECT()), VALUES(data)),
           updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(patch)],
      );
      res.json({ settings: await readGeneralSettings(pool) });
    } catch (error) {
      next(error);
    }
  });
}
