/**
 * Feature Flags — gradual activation of new functionality.
 */

import type { Pool } from "mysql2/promise";

const flagCache = new Map<string, { enabled: boolean; expires: number }>();
const CACHE_TTL = 30_000; // 30 seconds

export async function isFeatureEnabled(pool: Pool, flagKey: string, scope?: { type?: string; value?: string }): Promise<boolean> {
  const cacheKey = `${flagKey}:${scope?.type || "global"}:${scope?.value || ""}`;
  const cached = flagCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.enabled;

  try {
    // Check specific scope first, then global
    const [rows]: any = await pool.query(
      `SELECT enabled FROM feature_flags
       WHERE flag_key = ? AND (
         (scope = ? AND scope_value = ?) OR scope = 'global'
       )
       ORDER BY CASE WHEN scope = 'global' THEN 1 ELSE 0 END ASC
       LIMIT 1`,
      [flagKey, scope?.type || "global", scope?.value || ""],
    );

    const enabled = rows.length > 0 ? Boolean(rows[0].enabled) : false;
    flagCache.set(cacheKey, { enabled, expires: Date.now() + CACHE_TTL });
    return enabled;
  } catch {
    return false;
  }
}

export function clearFlagCache(): void {
  flagCache.clear();
}
