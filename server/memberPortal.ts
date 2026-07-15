/**
 * Member Portal API — Self-service endpoints for members to view their own data.
 *
 * These endpoints use the authenticated user's member_id to return only their data.
 * No admin permissions required — just authentication.
 */

import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { isFeatureEnabled } from "./featureFlags";

type PoolProvider = () => Pool | null;
type AuthenticatedRequest = Request & { user?: { uid?: string; email?: string; role?: string } };

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) throw Object.assign(new Error("Database not connected"), { status: 503 });
  return pool;
}

export function registerMemberPortalRoutes(app: Express, poolProvider: PoolProvider) {

  // Get current member's affiliations and session summary
  app.get("/api/member-portal/my-affiliations", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) {
        return res.json({ affiliations: [], message: "V2 subscriptions not active" });
      }

      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: "Authentication required" });

      // Find member by email
      const [members]: any = await pool.query("SELECT id, first_name, last_name FROM members WHERE email = ? LIMIT 1", [email]);
      if (members.length === 0) return res.json({ affiliations: [] });
      const memberId = members[0].id;

      const [rows]: any = await pool.query(
        `SELECT a.id, a.status, a.role, a.is_primary, a.start_date, a.end_date,
                pv.name AS plan_name, pv.plan_type, pv.sessions_unlimited, pv.sessions_per_cycle,
                s.status AS subscription_status
         FROM affiliations a
         JOIN plan_versions pv ON pv.id = a.plan_version_id
         JOIN subscriptions s ON s.id = a.subscription_id
         WHERE a.member_id = ? AND a.status = 'active'
         ORDER BY a.is_primary DESC, a.end_date ASC`,
        [memberId],
      );

      // Get balances for each affiliation
      const affiliations = [];
      for (const row of rows) {
        let balance = null;
        if (!row.sessions_unlimited) {
          const [balRows]: any = await pool.query(
            `SELECT sb.available, sb.included, sb.consumed, sb.reserved, sb.expired, sb.refunds
             FROM session_balances sb
             JOIN subscription_cycles sc ON sc.id = sb.cycle_id AND sc.status = 'active'
             WHERE sb.context_type = 'affiliation' AND sb.context_id = ?
             ORDER BY sc.cycle_number DESC LIMIT 1`,
            [row.id],
          );
          if (balRows.length > 0) {
            balance = {
              available: Number(balRows[0].available),
              included: Number(balRows[0].included),
              consumed: Number(balRows[0].consumed),
              reserved: Number(balRows[0].reserved),
            };
          }
        }

        affiliations.push({
          id: row.id,
          planName: row.plan_name,
          planType: row.plan_type,
          role: row.role,
          isPrimary: Boolean(row.is_primary),
          startDate: row.start_date ? String(row.start_date).slice(0, 10) : '',
          endDate: row.end_date ? String(row.end_date).slice(0, 10) : '',
          sessionsUnlimited: Boolean(row.sessions_unlimited),
          sessionsPerCycle: row.sessions_per_cycle ? Number(row.sessions_per_cycle) : null,
          balance,
        });
      }

      res.json({ memberId, memberName: `${members[0].first_name || ''} ${members[0].last_name || ''}`.trim(), affiliations });
    } catch (error) { next(error); }
  });

  // Get current member's access history
  app.get("/api/member-portal/my-access", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: "Authentication required" });

      const [members]: any = await pool.query("SELECT id FROM members WHERE email = ? LIMIT 1", [email]);
      if (members.length === 0) return res.json({ attempts: [] });

      const [rows]: any = await pool.query(
        `SELECT id, method, decision, denial_reason, created_at
         FROM access_attempts
         WHERE person_id = ? ORDER BY created_at DESC LIMIT 20`,
        [members[0].id],
      );

      res.json({
        attempts: rows.map((r: any) => ({
          id: r.id,
          method: r.method,
          decision: r.decision,
          reason: r.denial_reason || null,
          date: r.created_at ? new Date(r.created_at).toISOString() : null,
        })),
      });
    } catch (error) { next(error); }
  });

  // Get current member's session movements (last 30)
  app.get("/api/member-portal/my-movements", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: "Authentication required" });

      const [members]: any = await pool.query("SELECT id FROM members WHERE email = ? LIMIT 1", [email]);
      if (members.length === 0) return res.json({ movements: [] });

      const [rows]: any = await pool.query(
        `SELECT sm.id, sm.movement_type, sm.quantity, sm.direction, sm.balance_after, sm.reason, sm.created_at
         FROM session_movements sm
         JOIN affiliations a ON a.id = sm.affiliation_id
         WHERE a.member_id = ?
         ORDER BY sm.created_at DESC LIMIT 30`,
        [members[0].id],
      );

      res.json({
        movements: rows.map((r: any) => ({
          id: r.id,
          type: r.movement_type,
          quantity: Number(r.quantity),
          direction: r.direction,
          balanceAfter: Number(r.balance_after),
          reason: r.reason || '',
          date: r.created_at ? new Date(r.created_at).toISOString() : null,
        })),
      });
    } catch (error) { next(error); }
  });
}
