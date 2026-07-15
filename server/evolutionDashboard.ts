/**
 * Evolution Dashboard API — Metrics and operational visibility for the evolution system.
 *
 * Provides summary statistics for:
 * - Active subscriptions, affiliations, plan versions
 * - Session balances and consumption rates
 * - Cycle status overview
 * - Access attempts (today/week)
 * - Worker health (outbox, expired reservations)
 * - Feature flag status
 */

import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { requirePermission } from "./rbac";
import { isFeatureEnabled } from "./featureFlags";

type PoolProvider = () => Pool | null;

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) throw Object.assign(new Error("Database not connected"), { status: 503 });
  return pool;
}

export function registerEvolutionDashboardRoutes(app: Express, poolProvider: PoolProvider) {

  app.get("/api/v2/dashboard/summary", requirePermission("dashboard.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const enabled = await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL");
      if (!enabled) return res.json({ enabled: false, message: "Evolution system not active" });

      const today = new Date().toISOString().slice(0, 10);

      // Subscriptions
      const [subRows]: any = await pool.query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
        FROM subscriptions
      `);

      // Plan versions
      const [planRows]: any = await pool.query(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN plan_type = 'individual' THEN 1 ELSE 0 END) AS individual_plans,
          SUM(CASE WHEN plan_type = 'family' THEN 1 ELSE 0 END) AS family_plans,
          SUM(CASE WHEN plan_type = 'group' THEN 1 ELSE 0 END) AS group_plans,
          SUM(CASE WHEN plan_type = 'corporate' THEN 1 ELSE 0 END) AS corporate_plans
        FROM plan_versions WHERE status = 'active'
      `);

      // Affiliations
      const [affRows]: any = await pool.query(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
        FROM affiliations
      `);

      // Session balances (aggregated)
      const [balRows]: any = await pool.query(`
        SELECT
          COALESCE(SUM(included), 0) AS total_included,
          COALESCE(SUM(consumed), 0) AS total_consumed,
          COALESCE(SUM(reserved), 0) AS total_reserved,
          COALESCE(SUM(available), 0) AS total_available,
          COALESCE(SUM(expired), 0) AS total_expired,
          COALESCE(SUM(refunds), 0) AS total_refunds
        FROM session_balances
      `);

      // Active cycles
      const [cycleRows]: any = await pool.query(`
        SELECT COUNT(*) AS active_cycles,
          SUM(sessions_allocated) AS total_allocated
        FROM subscription_cycles WHERE status = 'active'
      `);

      // Access attempts today
      const [accessRows]: any = await pool.query(`
        SELECT
          COUNT(*) AS today_total,
          SUM(CASE WHEN decision = 'authorized' THEN 1 ELSE 0 END) AS today_authorized,
          SUM(CASE WHEN decision = 'denied' THEN 1 ELSE 0 END) AS today_denied
        FROM access_attempts WHERE DATE(created_at) = ?
      `, [today]);

      // Access attempts this week
      const [weekRows]: any = await pool.query(`
        SELECT COUNT(*) AS week_total,
          SUM(CASE WHEN decision = 'authorized' THEN 1 ELSE 0 END) AS week_authorized
        FROM access_attempts WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `);

      // Outbox health
      const [outboxRows]: any = await pool.query(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM outbox_events
      `);

      // Recent movements (last 24h)
      const [movRows]: any = await pool.query(`
        SELECT movement_type, COUNT(*) AS count
        FROM session_movements
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY movement_type ORDER BY count DESC
      `);

      // Feature flags
      const [flagRows]: any = await pool.query("SELECT flag_key, enabled FROM feature_flags WHERE scope = 'global'");

      const sub = subRows[0] || {};
      const plan = planRows[0] || {};
      const aff = affRows[0] || {};
      const bal = balRows[0] || {};
      const cyc = cycleRows[0] || {};
      const acc = accessRows[0] || {};
      const week = weekRows[0] || {};
      const outbox = outboxRows[0] || {};

      res.json({
        enabled: true,
        subscriptions: {
          total: Number(sub.total || 0),
          active: Number(sub.active || 0),
          expired: Number(sub.expired || 0),
          cancelled: Number(sub.cancelled || 0),
          suspended: Number(sub.suspended || 0),
        },
        plans: {
          total: Number(plan.total || 0),
          individual: Number(plan.individual_plans || 0),
          family: Number(plan.family_plans || 0),
          group: Number(plan.group_plans || 0),
          corporate: Number(plan.corporate_plans || 0),
        },
        affiliations: {
          total: Number(aff.total || 0),
          active: Number(aff.active || 0),
        },
        sessions: {
          totalIncluded: Number(bal.total_included || 0),
          totalConsumed: Number(bal.total_consumed || 0),
          totalReserved: Number(bal.total_reserved || 0),
          totalAvailable: Number(bal.total_available || 0),
          totalExpired: Number(bal.total_expired || 0),
          totalRefunds: Number(bal.total_refunds || 0),
          consumptionRate: Number(bal.total_included || 0) > 0
            ? Math.round((Number(bal.total_consumed || 0) / Number(bal.total_included || 1)) * 100)
            : 0,
        },
        cycles: {
          active: Number(cyc.active_cycles || 0),
          totalAllocated: Number(cyc.total_allocated || 0),
        },
        access: {
          todayTotal: Number(acc.today_total || 0),
          todayAuthorized: Number(acc.today_authorized || 0),
          todayDenied: Number(acc.today_denied || 0),
          weekTotal: Number(week.week_total || 0),
          weekAuthorized: Number(week.week_authorized || 0),
        },
        outbox: {
          pending: Number(outbox.pending || 0),
          failed: Number(outbox.failed || 0),
        },
        recentMovements: movRows.map((r: any) => ({ type: r.movement_type, count: Number(r.count) })),
        flags: flagRows.map((r: any) => ({ key: r.flag_key, enabled: Boolean(r.enabled) })),
      });
    } catch (error) { next(error); }
  });

  // Access trends (last 7 days by day)
  app.get("/api/v2/dashboard/access-trends", requirePermission("dashboard.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const [rows]: any = await pool.query(`
        SELECT DATE(created_at) AS day,
          COUNT(*) AS total,
          SUM(CASE WHEN decision = 'authorized' THEN 1 ELSE 0 END) AS authorized,
          SUM(CASE WHEN decision = 'denied' THEN 1 ELSE 0 END) AS denied
        FROM access_attempts
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at) ORDER BY day ASC
      `);
      res.json({
        trends: rows.map((r: any) => ({
          day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
          total: Number(r.total),
          authorized: Number(r.authorized),
          denied: Number(r.denied),
        })),
      });
    } catch (error) { next(error); }
  });

  // Top consumers (members with most consumed sessions)
  app.get("/api/v2/dashboard/top-consumers", requirePermission("dashboard.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const [rows]: any = await pool.query(`
        SELECT sm.affiliation_id, a.member_id, m.first_name, m.last_name,
          COUNT(*) AS sessions_consumed
        FROM session_movements sm
        JOIN affiliations a ON a.id = sm.affiliation_id
        JOIN members m ON m.id = a.member_id
        WHERE sm.movement_type = 'consumption'
          AND sm.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY sm.affiliation_id, a.member_id, m.first_name, m.last_name
        ORDER BY sessions_consumed DESC
        LIMIT 10
      `);
      res.json({
        topConsumers: rows.map((r: any) => ({
          memberId: r.member_id,
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          sessionsConsumed: Number(r.sessions_consumed),
        })),
      });
    } catch (error) { next(error); }
  });
}
