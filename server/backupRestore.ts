import type { Express, NextFunction, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import type { Pool } from "mysql2/promise";
import { boolEnv } from "../scripts/deploy-utils.mjs";
import {
  RESTORE_CONFIRMATION,
  buildMysqlRestoreArgs,
  createRestorePlan,
  getDatabaseEnvForRestore,
  inspectSqlBackup,
  listManagedBackups,
  resolveManagedBackupPath,
} from "../scripts/db-restore-utils.mjs";
import { type AuthenticatedRequest, requirePermission } from "./rbac";

type RestoreRequestBody = {
  name?: string;
  apply?: boolean;
  confirm?: string;
  allowDestructive?: boolean;
  allowProductionRestore?: boolean;
};

function backupDir() {
  return process.env.DATABASE_BACKUP_DIR || "backups";
}

function publicBackupMetadata(backup: any) {
  return {
    name: backup.name,
    size: backup.size,
    createdAt: backup.createdAt,
    modifiedAt: backup.modifiedAt,
  };
}

function publicInspection(inspection: any) {
  return {
    ok: inspection.ok,
    errors: inspection.errors || [],
    warnings: inspection.warnings || [],
    metrics: inspection.metrics || {},
  };
}

async function auditRestore(pool: Pool | null, action: string, details: string, actor: string) {
  if (!pool) return;
  try {
    await pool.query("INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)", [action, details, actor]);
  } catch {
    // Restore auditing must never block inspection/dry-run. Platform security logs still capture the request.
  }
}

async function runMysqlRestore(filePath: string, db: any) {
  const mysqlArgs = buildMysqlRestoreArgs(db);
  const child = spawn("mysql", mysqlArgs, {
    env: { ...process.env, MYSQL_PWD: db.password },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const pipePromise = pipeline(fs.createReadStream(filePath), child.stdin).catch(() => undefined);
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(Number(code || 0)));
  });
  await pipePromise;

  if (exitCode !== 0) {
    const error = new Error(stderr || `mysql exited with code ${exitCode}`) as Error & { exitCode?: number };
    error.exitCode = exitCode;
    throw error;
  }
}

export function registerBackupRestoreRoutes(app: Express, getPool: () => Pool | null) {
  const requireRestore = requirePermission("platform.backups.restore");

  app.get("/api/platform/backups/restore/backups", requireRestore, (_req: AuthenticatedRequest, res: Response) => {
    const backups = listManagedBackups({ backupDir: backupDir() }).map(publicBackupMetadata);
    res.json({ backups, confirmationRequired: RESTORE_CONFIRMATION });
  });

  app.get("/api/platform/backups/restore/backups/:name/inspect", requireRestore, (req: AuthenticatedRequest, res: Response) => {
    const resolved = resolveManagedBackupPath({ backupDir: backupDir(), name: req.params.name });
    if (!resolved || !fs.existsSync(resolved.filePath)) {
      return res.status(404).json({ error: "Backup not found" });
    }

    const inspection = inspectSqlBackup({ filePath: resolved.filePath });
    const plan = createRestorePlan({
      inspection,
      apply: false,
      apiRestoreEnabled: boolEnv(process.env.DATABASE_RESTORE_API_ENABLED),
      nodeEnv: process.env.NODE_ENV || "development",
      db: getDatabaseEnvForRestore(),
    });

    res.json({ backup: { name: resolved.fileName }, inspection: publicInspection(inspection), plan });
  });

  app.post("/api/platform/backups/restore/plan", requireRestore, (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as RestoreRequestBody;
    const resolved = resolveManagedBackupPath({ backupDir: backupDir(), name: body.name });
    if (!resolved || !fs.existsSync(resolved.filePath)) {
      return res.status(404).json({ error: "Backup not found" });
    }

    const inspection = inspectSqlBackup({ filePath: resolved.filePath });
    const plan = createRestorePlan({
      inspection,
      apply: Boolean(body.apply),
      confirmation: String(body.confirm || ""),
      allowDestructive: Boolean(body.allowDestructive) || boolEnv(process.env.DATABASE_RESTORE_ALLOW_DESTRUCTIVE),
      allowProductionRestore: Boolean(body.allowProductionRestore) || boolEnv(process.env.DATABASE_RESTORE_ALLOW_PRODUCTION),
      apiRestoreEnabled: boolEnv(process.env.DATABASE_RESTORE_API_ENABLED),
      nodeEnv: process.env.NODE_ENV || "development",
      db: getDatabaseEnvForRestore(),
    });

    res.json({ backup: { name: resolved.fileName }, inspection: publicInspection(inspection), plan });
  });

  app.post("/api/platform/backups/restore/execute", requireRestore, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RestoreRequestBody;
      const apply = Boolean(body.apply);
      const resolved = resolveManagedBackupPath({ backupDir: backupDir(), name: body.name });
      if (!resolved || !fs.existsSync(resolved.filePath)) {
        return res.status(404).json({ error: "Backup not found" });
      }

      const inspection = inspectSqlBackup({ filePath: resolved.filePath });
      const plan = createRestorePlan({
        inspection,
        apply,
        confirmation: String(body.confirm || ""),
        allowDestructive: Boolean(body.allowDestructive) || boolEnv(process.env.DATABASE_RESTORE_ALLOW_DESTRUCTIVE),
        allowProductionRestore: Boolean(body.allowProductionRestore) || boolEnv(process.env.DATABASE_RESTORE_ALLOW_PRODUCTION),
        apiRestoreEnabled: boolEnv(process.env.DATABASE_RESTORE_API_ENABLED),
        nodeEnv: process.env.NODE_ENV || "development",
        db: getDatabaseEnvForRestore(),
      });

      const actor = req.user?.email || req.user?.uid || "unknown";
      if (!apply) {
        await auditRestore(getPool(), "BACKUP_RESTORE_DRY_RUN", `Backup: ${resolved.fileName} | Can apply: ${plan.canApply}`, actor);
        return res.json({ backup: { name: resolved.fileName }, inspection: publicInspection(inspection), plan, restored: false });
      }

      if (!plan.canApply) {
        await auditRestore(getPool(), "BACKUP_RESTORE_BLOCKED", `Backup: ${resolved.fileName} | Blockers: ${plan.blockers.join("; ")}`, actor);
        return res.status(409).json({ error: "Restore blocked", backup: { name: resolved.fileName }, inspection: publicInspection(inspection), plan });
      }

      await auditRestore(getPool(), "BACKUP_RESTORE_STARTED", `Backup: ${resolved.fileName} | SHA256: ${inspection.metrics?.sha256 || "unknown"}`, actor);
      await runMysqlRestore(resolved.filePath, getDatabaseEnvForRestore());
      await auditRestore(getPool(), "BACKUP_RESTORE_COMPLETED", `Backup: ${resolved.fileName}`, actor);
      return res.json({ status: "success", backup: { name: resolved.fileName }, restored: true });
    } catch (error) {
      return next(error);
    }
  });
}
