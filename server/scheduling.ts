import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { hasPermission, requirePermission } from "./rbac";

type PoolProvider = () => Pool | null;

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
};

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
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

function requireScheduler(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!hasPermission(req as any, "scheduling.write")) {
    return res.status(403).json({ error: "Scheduling permission required" });
  }
  return next();
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function toMysqlJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

async function tableColumnExists(pool: Pool, tableName: string, columnName: string) {
  const [rows]: any = await pool.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureTableColumn(pool: Pool, tableName: string, columnName: string, definition: string) {
  if (!/^[A-Za-z0-9_]+$/.test(tableName) || !/^[A-Za-z0-9_]+$/.test(columnName)) {
    throw new Error("Invalid schema compatibility request");
  }

  if (!(await tableColumnExists(pool, tableName, columnName))) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

function parseDateTime(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toMysqlDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function rowDateToIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function mapClassSession(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    title: row.title,
    trainerId: row.trainer_id,
    trainerName: row.trainer_name || "",
    capacity: Number(row.capacity || 0),
    enrolledCount: Number(row.enrolled_count || 0),
    startTime: rowDateToIso(row.start_time),
    endTime: rowDateToIso(row.end_time),
    room: row.room,
    status: row.status || "scheduled",
    type: row.class_type || "General",
    level: row.level || "General",
    branch: row.branch || "General",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

function mapClassBooking(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    classId: row.class_id,
    memberId: row.member_id,
    memberName: row.member_name || "",
    status: row.status || "booked",
    bookedAt: row.booked_at,
    cancelledAt: row.cancelled_at,
    data,
  };
}

function mapPrivateSession(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    seriesId: row.series_id,
    memberId: row.member_id,
    memberName: row.member_name || "",
    trainerId: row.trainer_id,
    trainerName: row.trainer_name || "",
    startTime: rowDateToIso(row.start_time),
    endTime: rowDateToIso(row.end_time),
    room: row.room,
    status: row.status || "scheduled",
    level: row.level || "General",
    branch: row.branch || "General",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

async function ensureSchedulingSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_sessions (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      trainer_id VARCHAR(255) NULL,
      trainer_name VARCHAR(160) NULL,
      capacity INT NOT NULL DEFAULT 0,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      room VARCHAR(120) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
      class_type VARCHAR(80) NULL,
      level VARCHAR(80) NULL,
      branch VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_class_sessions_time (start_time, end_time),
      INDEX idx_class_sessions_trainer_time (trainer_id, start_time),
      INDEX idx_class_sessions_room_time (room, start_time),
      INDEX idx_class_sessions_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_bookings (
      id VARCHAR(64) PRIMARY KEY,
      class_id VARCHAR(64) NOT NULL,
      member_id VARCHAR(255) NOT NULL,
      member_name VARCHAR(180) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'booked',
      booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      cancelled_at DATETIME NULL,
      data JSON NULL,
      UNIQUE KEY uq_class_bookings_active_member (class_id, member_id, status),
      INDEX idx_class_bookings_class (class_id),
      INDEX idx_class_bookings_member (member_id),
      CONSTRAINT fk_class_bookings_class FOREIGN KEY (class_id) REFERENCES class_sessions(id) ON DELETE CASCADE
    )
  `);

  await ensureTableColumn(pool, "class_bookings", "member_name", "VARCHAR(180) NULL");
  await ensureTableColumn(pool, "class_bookings", "cancelled_at", "DATETIME NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS private_sessions (
      id VARCHAR(64) PRIMARY KEY,
      series_id VARCHAR(64) NULL,
      member_id VARCHAR(255) NOT NULL,
      member_name VARCHAR(180) NULL,
      trainer_id VARCHAR(255) NOT NULL,
      trainer_name VARCHAR(180) NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      room VARCHAR(120) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
      level VARCHAR(80) NULL,
      branch VARCHAR(120) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_private_sessions_time (start_time, end_time),
      INDEX idx_private_sessions_trainer_time (trainer_id, start_time),
      INDEX idx_private_sessions_member_time (member_id, start_time),
      INDEX idx_private_sessions_room_time (room, start_time),
      INDEX idx_private_sessions_status (status)
    )
  `);
}

async function findConflicts(
  pool: Pool,
  params: {
    start: Date;
    end: Date;
    room?: string;
    trainerId?: string;
    memberId?: string;
    excludeClassId?: string;
    excludePrivateId?: string;
  },
) {
  const start = toMysqlDateTime(params.start);
  const end = toMysqlDateTime(params.end);
  const conflicts: Array<{ type: string; id: string; reason: string; title?: string; startTime?: string | null; endTime?: string | null }> = [];

  const classFilters = ["status NOT IN ('cancelled', 'deleted')", "start_time < ?", "end_time > ?"];
  const classValues: any[] = [end, start];
  const classReasons: string[] = [];

  if (params.room) {
    classReasons.push("room = ?");
    classValues.push(params.room);
  }
  if (params.trainerId) {
    classReasons.push("trainer_id = ?");
    classValues.push(params.trainerId);
  }
  if (params.excludeClassId) {
    classFilters.push("id <> ?");
    classValues.push(params.excludeClassId);
  }

  if (classReasons.length > 0) {
    const [classRows]: any = await pool.query(
      `SELECT id, title, room, trainer_id, start_time, end_time FROM class_sessions
       WHERE ${classFilters.join(" AND ")} AND (${classReasons.join(" OR ")})
       LIMIT 10`,
      classValues,
    );
    for (const row of classRows) {
      conflicts.push({
        type: "group_class",
        id: row.id,
        title: row.title,
        reason: row.room === params.room ? `Room ${params.room} is already booked` : "Trainer is already booked",
        startTime: rowDateToIso(row.start_time),
        endTime: rowDateToIso(row.end_time),
      });
    }
  }

  const privateFilters = ["status NOT IN ('cancelled', 'deleted')", "start_time < ?", "end_time > ?"];
  const privateValues: any[] = [end, start];
  const privateReasons: string[] = [];

  if (params.room) {
    privateReasons.push("room = ?");
    privateValues.push(params.room);
  }
  if (params.trainerId) {
    privateReasons.push("trainer_id = ?");
    privateValues.push(params.trainerId);
  }
  if (params.memberId) {
    privateReasons.push("member_id = ?");
    privateValues.push(params.memberId);
  }
  if (params.excludePrivateId) {
    privateFilters.push("id <> ?");
    privateValues.push(params.excludePrivateId);
  }

  if (privateReasons.length > 0) {
    const [privateRows]: any = await pool.query(
      `SELECT id, member_name, room, trainer_id, member_id, start_time, end_time FROM private_sessions
       WHERE ${privateFilters.join(" AND ")} AND (${privateReasons.join(" OR ")})
       LIMIT 10`,
      privateValues,
    );
    for (const row of privateRows) {
      const reason = row.room === params.room
        ? `Room ${params.room} is already booked`
        : row.trainer_id === params.trainerId
          ? "Trainer is already booked"
          : "Member is already booked";
      conflicts.push({
        type: "private_session",
        id: row.id,
        title: row.member_name ? `Private session: ${row.member_name}` : "Private session",
        reason,
        startTime: rowDateToIso(row.start_time),
        endTime: rowDateToIso(row.end_time),
      });
    }
  }

  return conflicts;
}

function datesBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const result: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    result.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function buildSessionDateTime(date: Date, hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const result = new Date(date);
  result.setUTCHours(hours, minutes, 0, 0);
  return result;
}

export function registerSchedulingRoutes(app: Express, poolProvider: PoolProvider) {
  app.use("/api/scheduling", requirePermission("scheduling.read"));
  let schemaReady: Promise<void> | null = null;

  async function getReadyPool() {
    const pool = requirePool(poolProvider);
    schemaReady ||= ensureSchedulingSchema(pool);
    await schemaReady;
    return pool;
  }

  app.get("/api/scheduling/resources", async (_req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [memberRows]: any = await pool.query(
        "SELECT id, first_name, last_name, email, status FROM members WHERE status <> 'archived' ORDER BY first_name ASC, last_name ASC LIMIT 500",
      );
      const [trainerRows]: any = await pool.query(
        // Canonical source: employees + admin_users (staff migrated in 023)
        "SELECT e.id, e.first_name, e.last_name, e.email, COALESCE(au.role, e.job_title, 'trainer') AS role, e.employment_status AS status FROM employees e LEFT JOIN admin_users au ON LOWER(TRIM(au.email)) = LOWER(TRIM(e.email)) WHERE e.employment_status <> 'archived' ORDER BY e.first_name ASC, e.last_name ASC LIMIT 500",
      );
      const fallbackRooms = (process.env.POWERGYM_ROOMS || "Main Studio,Strength Room,Personal Training Area,Sala A,Sala B")
        .split(",")
        .map((room) => room.trim())
        .filter(Boolean);

      res.json({
        members: memberRows.map((row: any) => ({
          id: row.id,
          firstName: row.first_name || "",
          lastName: row.last_name || "",
          email: row.email || "",
          status: row.status || "active",
        })),
        trainers: trainerRows.map((row: any) => ({
          id: row.id,
          firstName: row.first_name || "",
          lastName: row.last_name || "",
          email: row.email || "",
          role: row.role || "trainer",
          status: row.status || "active",
        })),
        rooms: fallbackRooms,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scheduling/classes", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const from = parseDateTime(req.query.from) || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const to = parseDateTime(req.query.to) || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const filters = ["c.start_time >= ?", "c.start_time <= ?", "c.status <> 'deleted'"];
      const values: any[] = [toMysqlDateTime(from), toMysqlDateTime(to)];

      const trainerId = normalizeString(req.query.trainerId);
      const branch = normalizeString(req.query.branch);
      const type = normalizeString(req.query.type);
      const status = normalizeString(req.query.status);

      if (trainerId) {
        filters.push("c.trainer_id = ?");
        values.push(trainerId);
      }
      if (branch) {
        filters.push("c.branch = ?");
        values.push(branch);
      }
      if (type) {
        filters.push("c.class_type = ?");
        values.push(type);
      }
      if (status) {
        filters.push("c.status = ?");
        values.push(status);
      }

      const [rows]: any = await pool.query(
        `SELECT c.*, COALESCE(SUM(CASE WHEN b.status = 'booked' THEN 1 ELSE 0 END), 0) AS enrolled_count
         FROM class_sessions c
         LEFT JOIN class_bookings b ON b.class_id = c.id
         WHERE ${filters.join(" AND ")}
         GROUP BY c.id
         ORDER BY c.start_time ASC
         LIMIT 1000`,
        values,
      );

      res.json({ classes: rows.map(mapClassSession) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scheduling/classes", requireScheduler, async (req: AuthenticatedRequest, res, next) => {
    try {
      const title = normalizeString(req.body.title);
      const trainerId = normalizeString(req.body.trainerId);
      const trainerName = normalizeString(req.body.trainerName);
      const room = normalizeString(req.body.room);
      const start = parseDateTime(req.body.startTime);
      const durationMinutes = numberOrDefault(req.body.durationMinutes, 60);
      const end = parseDateTime(req.body.endTime) || (start ? new Date(start.getTime() + durationMinutes * 60 * 1000) : null);
      const capacity = numberOrDefault(req.body.capacity, 0);
      const status = normalizeString(req.body.status) || "scheduled";
      const classType = normalizeString(req.body.type) || "General";
      const level = normalizeString(req.body.level) || "General";
      const branch = normalizeString(req.body.branch) || "General";

      if (!title) return res.status(400).json({ error: "title is required" });
      if (!room) return res.status(400).json({ error: "room is required" });
      if (!start || !end) return res.status(400).json({ error: "valid startTime and endTime/durationMinutes are required" });
      if (end <= start) return res.status(400).json({ error: "endTime must be after startTime" });
      if (capacity <= 0) return res.status(400).json({ error: "capacity must be greater than zero" });

      const pool = await getReadyPool();
      const conflicts = await findConflicts(pool, { start, end, room, trainerId });
      if (conflicts.length > 0 && !req.body.allowConflicts) {
        return res.status(409).json({ error: "Schedule conflict detected", conflicts });
      }

      const id = normalizeString(req.body.id) || createId("cls");
      await pool.query(
        `INSERT INTO class_sessions (id, title, trainer_id, trainer_name, capacity, start_time, end_time, room, status, class_type, level, branch, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title,
          trainerId || null,
          trainerName || null,
          capacity,
          toMysqlDateTime(start),
          toMysqlDateTime(end),
          room,
          status,
          classType,
          level,
          branch,
          toMysqlJson(req.body.data),
        ],
      );

      const [rows]: any = await pool.query(
        `SELECT c.*, 0 AS enrolled_count FROM class_sessions c WHERE c.id = ?`,
        [id],
      );
      res.status(201).json({ classSession: mapClassSession(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/scheduling/classes/:id", requireScheduler, async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [existing]: any = await pool.query("SELECT * FROM class_sessions WHERE id = ?", [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ error: "Class not found" });
      const current = mapClassSession(existing[0]);

      const start = parseDateTime(req.body.startTime) || parseDateTime(current.startTime);
      const durationMinutes = numberOrDefault(req.body.durationMinutes, 60);
      const end = parseDateTime(req.body.endTime) || (start ? new Date(start.getTime() + durationMinutes * 60 * 1000) : null);
      if (!start || !end || end <= start) return res.status(400).json({ error: "Invalid class time" });

      const room = normalizeString(req.body.room) || current.room;
      const trainerId = req.body.trainerId === undefined ? current.trainerId : normalizeString(req.body.trainerId);
      const conflicts = await findConflicts(pool, { start, end, room, trainerId, excludeClassId: req.params.id });
      if (conflicts.length > 0 && !req.body.allowConflicts) {
        return res.status(409).json({ error: "Schedule conflict detected", conflicts });
      }

      await pool.query(
        `UPDATE class_sessions
         SET title = ?, trainer_id = ?, trainer_name = ?, capacity = ?, start_time = ?, end_time = ?, room = ?, status = ?, class_type = ?, level = ?, branch = ?, data = ?
         WHERE id = ?`,
        [
          normalizeString(req.body.title) || current.title,
          trainerId || null,
          req.body.trainerName === undefined ? current.trainerName : normalizeString(req.body.trainerName) || null,
          req.body.capacity === undefined ? current.capacity : numberOrDefault(req.body.capacity, current.capacity),
          toMysqlDateTime(start),
          toMysqlDateTime(end),
          room,
          normalizeString(req.body.status) || current.status,
          normalizeString(req.body.type) || current.type,
          normalizeString(req.body.level) || current.level,
          normalizeString(req.body.branch) || current.branch,
          toMysqlJson(req.body.data ?? current.data),
          req.params.id,
        ],
      );

      const [rows]: any = await pool.query(
        `SELECT c.*, COALESCE(SUM(CASE WHEN b.status = 'booked' THEN 1 ELSE 0 END), 0) AS enrolled_count
         FROM class_sessions c LEFT JOIN class_bookings b ON b.class_id = c.id
         WHERE c.id = ? GROUP BY c.id`,
        [req.params.id],
      );
      res.json({ classSession: mapClassSession(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/scheduling/classes/:id", requireScheduler, async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      await pool.query("UPDATE class_sessions SET status = 'cancelled' WHERE id = ?", [req.params.id]);
      await pool.query("UPDATE class_bookings SET status = 'cancelled', cancelled_at = NOW() WHERE class_id = ? AND status = 'booked'", [req.params.id]);
      res.json({ success: true, status: "cancelled" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scheduling/classes/:id/bookings", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const [rows]: any = await pool.query(
        "SELECT * FROM class_bookings WHERE class_id = ? ORDER BY booked_at ASC",
        [req.params.id],
      );
      res.json({ bookings: rows.map(mapClassBooking) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scheduling/classes/:id/bookings", requireScheduler, async (req, res, next) => {
    const pool = await getReadyPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const memberId = normalizeString(req.body.memberId);
      const memberName = normalizeString(req.body.memberName);
      if (!memberId) {
        await connection.rollback();
        return res.status(400).json({ error: "memberId is required" });
      }

      const [classes]: any = await connection.query("SELECT * FROM class_sessions WHERE id = ? FOR UPDATE", [req.params.id]);
      if (classes.length === 0 || classes[0].status === "cancelled") {
        await connection.rollback();
        return res.status(404).json({ error: "Class not found" });
      }

      const [countRows]: any = await connection.query(
        "SELECT COUNT(*) AS total FROM class_bookings WHERE class_id = ? AND status = 'booked'",
        [req.params.id],
      );
      if (Number(countRows[0].total) >= Number(classes[0].capacity || 0)) {
        await connection.rollback();
        return res.status(409).json({ error: "Class capacity is full" });
      }

      const start = classes[0].start_time instanceof Date ? classes[0].start_time : new Date(classes[0].start_time);
      const end = classes[0].end_time instanceof Date ? classes[0].end_time : new Date(classes[0].end_time);
      const conflicts = await findConflicts(pool, { start, end, memberId });
      const memberConflicts = conflicts.filter((conflict) => conflict.type === "private_session");
      if (memberConflicts.length > 0 && !req.body.allowConflicts) {
        await connection.rollback();
        return res.status(409).json({ error: "Member is already booked", conflicts: memberConflicts });
      }

      const [duplicateRows]: any = await connection.query(
        "SELECT * FROM class_bookings WHERE class_id = ? AND member_id = ? AND status = 'booked' LIMIT 1",
        [req.params.id, memberId],
      );
      if (duplicateRows.length > 0) {
        await connection.rollback();
        return res.status(409).json({ error: "Member is already booked in this class" });
      }

      const bookingId = createId("book");
      await connection.query(
        `INSERT INTO class_bookings (id, class_id, member_id, member_name, status, data)
         VALUES (?, ?, ?, ?, 'booked', ?)`,
        [bookingId, req.params.id, memberId, memberName || null, toMysqlJson(req.body.data)],
      );

      // Session ledger integration: reserve a session if feature is enabled
      let movementId: string | null = null;
      let sessionsRemaining: number | null = null;
      try {
        const { isFeatureEnabled } = await import("./featureFlags");
        const ledgerEnabled = await isFeatureEnabled(pool, "ENABLE_SESSION_LEDGER");
        if (ledgerEnabled) {
          // Find active affiliation for this member
          const [affRows]: any = await connection.query(
            `SELECT a.id, a.subscription_id, pv.sessions_unlimited
             FROM affiliations a
             JOIN plan_versions pv ON pv.id = a.plan_version_id
             JOIN subscriptions s ON s.id = a.subscription_id AND s.status = 'active'
             WHERE a.member_id = ? AND a.status = 'active' AND a.end_date >= CURDATE()
             ORDER BY a.is_primary DESC, a.end_date ASC LIMIT 1`,
            [memberId],
          );
          if (affRows.length > 0 && !affRows[0].sessions_unlimited) {
            const [cycleRows]: any = await connection.query(
              "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
              [affRows[0].subscription_id],
            );
            if (cycleRows.length > 0) {
              const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
              const balance = await getBalanceForUpdate(connection, "affiliation", affRows[0].id, cycleRows[0].id);
              if (balance.available > 0) {
                const movement = await createMovement(connection, {
                  balanceId: balance.id,
                  affiliationId: affRows[0].id,
                  cycleId: cycleRows[0].id,
                  movementType: "reservation",
                  quantity: 1,
                  referenceType: "class_booking",
                  referenceId: bookingId,
                  reason: `Class booking: ${classes[0].title}`,
                  performedBy: (req as any).user?.email || "system",
                  idempotencyKey: `booking_reserve_${bookingId}`,
                });
                movementId = movement.id;
                sessionsRemaining = movement.balanceAfter;
              }
            }
          }
        }
      } catch {
        // Session ledger errors should not block the booking
      }

      await connection.commit();

      const [rows]: any = await pool.query("SELECT * FROM class_bookings WHERE id = ?", [bookingId]);
      const booking = mapClassBooking(rows[0]);
      res.status(201).json({ booking, movementId, sessionsRemaining });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.delete("/api/scheduling/bookings/:id", requireScheduler, async (req, res, next) => {
    try {
      const pool = await getReadyPool();

      // Refund session if ledger is active and a reservation was made
      try {
        const { isFeatureEnabled } = await import("./featureFlags");
        const ledgerEnabled = await isFeatureEnabled(pool, "ENABLE_SESSION_LEDGER");
        if (ledgerEnabled) {
          // Find the reservation movement for this booking
          const [movRows]: any = await pool.query(
            "SELECT id, balance_id, affiliation_id, cycle_id FROM session_movements WHERE reference_type = 'class_booking' AND reference_id = ? AND movement_type = 'reservation' LIMIT 1",
            [req.params.id],
          );
          if (movRows.length > 0) {
            const connection = await pool.getConnection();
            try {
              await connection.beginTransaction();
              const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
              await getBalanceForUpdate(connection, "affiliation", movRows[0].affiliation_id, movRows[0].cycle_id);
              await createMovement(connection, {
                balanceId: movRows[0].balance_id,
                affiliationId: movRows[0].affiliation_id,
                cycleId: movRows[0].cycle_id,
                movementType: "release",
                quantity: 1,
                referenceType: "class_booking_cancel",
                referenceId: req.params.id,
                relatedMovementId: movRows[0].id,
                reason: "Booking cancelled — session released",
                performedBy: (req as any).user?.email || "system",
                idempotencyKey: `booking_release_${req.params.id}`,
              });
              await connection.commit();
            } catch {
              await connection.rollback();
            } finally {
              connection.release();
            }
          }
        }
      } catch {
        // Ledger errors should not block cancellation
      }

      await pool.query("UPDATE class_bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?", [req.params.id]);
      res.json({ success: true, status: "cancelled" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scheduling/private-classes", async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const from = parseDateTime(req.query.from) || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const to = parseDateTime(req.query.to) || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const filters = ["start_time >= ?", "start_time <= ?", "status <> 'deleted'"];
      const values: any[] = [toMysqlDateTime(from), toMysqlDateTime(to)];

      const trainerId = normalizeString(req.query.trainerId);
      const memberId = normalizeString(req.query.memberId);
      const status = normalizeString(req.query.status);
      if (trainerId) {
        filters.push("trainer_id = ?");
        values.push(trainerId);
      }
      if (memberId) {
        filters.push("member_id = ?");
        values.push(memberId);
      }
      if (status) {
        filters.push("status = ?");
        values.push(status);
      }

      const [rows]: any = await pool.query(
        `SELECT * FROM private_sessions WHERE ${filters.join(" AND ")} ORDER BY start_time ASC LIMIT 1000`,
        values,
      );
      res.json({ privateClasses: rows.map(mapPrivateSession) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scheduling/private-classes", requireScheduler, async (req, res, next) => {
    const pool = await getReadyPool();
    const connection = await pool.getConnection();
    try {
      const memberId = normalizeString(req.body.memberId);
      const memberName = normalizeString(req.body.memberName);
      const trainerId = normalizeString(req.body.trainerId);
      const trainerName = normalizeString(req.body.trainerName);
      const room = normalizeString(req.body.room);
      const level = normalizeString(req.body.level) || "General";
      const branch = normalizeString(req.body.branch) || "General";
      const notes = normalizeString(req.body.notes);
      const startDate = normalizeString(req.body.startDate);
      const endDate = normalizeString(req.body.endDate || req.body.startDate);
      const startTime = normalizeString(req.body.startTime);
      const durationMinutes = numberOrDefault(req.body.durationMinutes, 60);
      const selectedDays = Array.isArray(req.body.selectedDays)
        ? req.body.selectedDays.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 6)
        : [];

      if (!memberId) return res.status(400).json({ error: "memberId is required" });
      if (!trainerId) return res.status(400).json({ error: "trainerId is required" });
      if (!room) return res.status(400).json({ error: "room is required" });
      if (!startDate || !endDate || !startTime) return res.status(400).json({ error: "startDate, endDate, and startTime are required" });
      if (durationMinutes <= 0) return res.status(400).json({ error: "durationMinutes must be greater than zero" });

      const days = datesBetween(startDate, endDate);
      const selectedSet = new Set(selectedDays.length > 0 ? selectedDays : days.map((day) => day.getUTCDay()));
      const occurrences = days
        .filter((day) => selectedSet.has(day.getUTCDay()))
        .map((day) => {
          const start = buildSessionDateTime(day, startTime);
          const end = start ? new Date(start.getTime() + durationMinutes * 60 * 1000) : null;
          return start && end ? { start, end } : null;
        })
        .filter((item): item is { start: Date; end: Date } => Boolean(item));

      if (occurrences.length === 0) return res.status(400).json({ error: "No matching session dates were generated" });

      const conflictList = [];
      for (const occurrence of occurrences) {
        const conflicts = await findConflicts(pool, {
          start: occurrence.start,
          end: occurrence.end,
          room,
          trainerId,
          memberId,
        });
        if (conflicts.length > 0) {
          conflictList.push({ date: toDateOnly(occurrence.start), conflicts });
        }
      }

      if (conflictList.length > 0 && !req.body.allowConflicts) {
        return res.status(409).json({ error: "Schedule conflict detected", conflicts: conflictList });
      }

      await connection.beginTransaction();
      const seriesId = createId("series");
      const createdIds: string[] = [];
      for (const occurrence of occurrences) {
        const id = createId("priv");
        createdIds.push(id);
        await connection.query(
          `INSERT INTO private_sessions (id, series_id, member_id, member_name, trainer_id, trainer_name, start_time, end_time, room, status, level, branch, notes, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`,
          [
            id,
            seriesId,
            memberId,
            memberName || null,
            trainerId,
            trainerName || null,
            toMysqlDateTime(occurrence.start),
            toMysqlDateTime(occurrence.end),
            room,
            level,
            branch,
            notes || null,
            toMysqlJson(req.body.data),
          ],
        );
      }
      await connection.commit();

      const [rows]: any = await pool.query(
        `SELECT * FROM private_sessions WHERE id IN (${createdIds.map(() => "?").join(",")}) ORDER BY start_time ASC`,
        createdIds,
      );
      res.status(201).json({ seriesId, privateClasses: rows.map(mapPrivateSession) });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.put("/api/scheduling/private-classes/:id", requireScheduler, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getReadyPool();
      const [existing]: any = await pool.query("SELECT * FROM private_sessions WHERE id = ?", [req.params.id]);
      if (existing.length === 0) return res.status(404).json({ error: "Private session not found" });
      const current = existing[0];

      const start = parseDateTime(req.body.startTime) || new Date(current.start_time);
      const durationMinutes = numberOrDefault(req.body.durationMinutes, 60);
      const end = parseDateTime(req.body.endTime) || new Date(start.getTime() + durationMinutes * 60 * 1000);
      if (!start || !end || end <= start) return res.status(400).json({ error: "Invalid session time" });

      const room = normalizeString(req.body.room) || current.room;
      const trainerId = req.body.trainerId === undefined ? current.trainer_id : normalizeString(req.body.trainerId);
      const memberId = req.body.memberId === undefined ? current.member_id : normalizeString(req.body.memberId);

      const conflicts = await findConflicts(pool, { start, end, room, trainerId, memberId, excludePrivateId: req.params.id });
      if (conflicts.length > 0 && !req.body.allowConflicts) {
        return res.status(409).json({ error: "Schedule conflict detected", conflicts });
      }

      await pool.query(
        `UPDATE private_sessions
         SET member_id = ?, member_name = ?, trainer_id = ?, trainer_name = ?, start_time = ?, end_time = ?, room = ?, status = ?, level = ?, branch = ?, notes = ?, data = ?
         WHERE id = ?`,
        [
          memberId,
          req.body.memberName === undefined ? current.member_name : normalizeString(req.body.memberName) || null,
          trainerId,
          req.body.trainerName === undefined ? current.trainer_name : normalizeString(req.body.trainerName) || null,
          toMysqlDateTime(start),
          toMysqlDateTime(end),
          room,
          normalizeString(req.body.status) || current.status,
          normalizeString(req.body.level) || current.level,
          normalizeString(req.body.branch) || current.branch,
          req.body.notes === undefined ? current.notes : normalizeString(req.body.notes),
          toMysqlJson(req.body.data ?? (typeof current.data === "string" ? JSON.parse(current.data || "{}") : current.data || {})),
          req.params.id,
        ],
      );

      const [rows]: any = await pool.query("SELECT * FROM private_sessions WHERE id = ?", [req.params.id]);
      res.json({ privateClass: mapPrivateSession(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/scheduling/private-classes/:id", requireScheduler, async (req, res, next) => {
    try {
      const pool = await getReadyPool();
      const scope = normalizeString(req.query.scope);
      if (scope === "series") {
        const [rows]: any = await pool.query("SELECT series_id FROM private_sessions WHERE id = ?", [req.params.id]);
        const seriesId = rows[0]?.series_id;
        if (seriesId) {
          await pool.query("UPDATE private_sessions SET status = 'cancelled' WHERE series_id = ?", [seriesId]);
          return res.json({ success: true, status: "cancelled", scope: "series" });
        }
      }
      await pool.query("UPDATE private_sessions SET status = 'cancelled' WHERE id = ?", [req.params.id]);
      res.json({ success: true, status: "cancelled", scope: "single" });
    } catch (error) {
      next(error);
    }
  });
}
