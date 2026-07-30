#!/usr/bin/env node
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY_CONFIRMATION = 'APPLY_RETENTION';

function boundedDays(value, fallback, minimum, name) {
  const days = Number(value || fallback);
  if (!Number.isInteger(days) || days < minimum || days > 3650) {
    throw new Error(`${name} must be an integer between ${minimum} and 3650 days.`);
  }
  return days;
}

export function buildRetentionPolicy(env = process.env) {
  const auditDays = boundedDays(
    env.AUDIT_LOG_RETENTION_DAYS,
    730,
    365,
    'AUDIT_LOG_RETENTION_DAYS',
  );
  const securityAuditDays = boundedDays(
    env.SECURITY_AUDIT_RETENTION_DAYS,
    auditDays,
    365,
    'SECURITY_AUDIT_RETENTION_DAYS',
  );
  const notificationDays = boundedDays(
    env.NOTIFICATION_RETENTION_DAYS,
    90,
    30,
    'NOTIFICATION_RETENTION_DAYS',
  );
  const backupDays = boundedDays(
    env.DATABASE_BACKUP_RETENTION_DAYS,
    30,
    7,
    'DATABASE_BACKUP_RETENTION_DAYS',
  );
  return {
    auditDays,
    securityAuditDays,
    notificationDays,
    backupDays,
    protectedTables: [
      'finance_transactions',
      'trainer_plan_commissions',
      'trainer_commission_payments',
      'session_movements',
      'warehouse_stock_movements',
      'invoices',
    ],
    operations: [
      {
        id: 'application-audit',
        table: 'audit_logs',
        days: auditDays,
        where: `created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${auditDays} DAY)`,
      },
      {
        id: 'security-audit',
        table: 'security_audit_events',
        days: securityAuditDays,
        where: `created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${securityAuditDays} DAY)`,
      },
      {
        id: 'closed-notifications',
        table: 'notifications',
        days: notificationDays,
        where: `created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${notificationDays} DAY)
          AND (read_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP()))`,
      },
    ],
  };
}

export function parseRetentionArgs(argv = process.argv.slice(2)) {
  const args = { apply: false, confirm: '', json: false, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }
    const [name, inlineValue] = token.startsWith('--')
      ? token.slice(2).split('=', 2)
      : ['', undefined];
    if (!name) throw new Error(`Unknown option: ${token}`);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (name === 'confirm') args.confirm = String(value || '');
    else if (name === 'output') args.output = String(value || '');
    else throw new Error(`Unknown option: --${name}`);
  }
  if (args.apply && args.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Applying retention requires --confirm=${APPLY_CONFIRMATION}.`);
  }
  return args;
}

export function summarizeRetentionResults(results, apply) {
  const failed = results.filter((result) => result.status === 'failed').length;
  return {
    posture: failed ? 'block' : apply ? 'pass' : 'preview',
    operations: results.length,
    failed,
    candidateRows: results.reduce((total, result) => total + Number(result.candidateRows || 0), 0),
    deletedRows: results.reduce((total, result) => total + Number(result.deletedRows || 0), 0),
    candidateFiles: results.reduce((total, result) => total + Number(result.candidateFiles || 0), 0),
    quarantinedFiles: results.reduce((total, result) => total + Number(result.quarantinedFiles || 0), 0),
  };
}

export function inspectManagedBackups(
  backupDir,
  backupDays,
  now = new Date(),
) {
  if (!fs.existsSync(backupDir)) {
    return { files: [], invalidFiles: [], expiredFiles: [] };
  }
  const cutoffMs = now.getTime() - backupDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => {
      const stats = fs.statSync(path.join(backupDir, entry.name));
      return {
        name: entry.name,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        modifiedAtMs: stats.mtimeMs,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    files,
    invalidFiles: files.filter((file) => file.size === 0).map((file) => file.name),
    expiredFiles: files
      .filter((file) => file.size > 0 && file.modifiedAtMs < cutoffMs)
      .map((file) => file.name),
  };
}

function quarantineManagedBackups(backupDir, inspection, timestamp) {
  const candidates = [...new Set([
    ...inspection.invalidFiles,
    ...inspection.expiredFiles,
  ])];
  if (!candidates.length) {
    return {
      quarantineDirectory: null,
      quarantinedFiles: [],
      rollback: () => undefined,
    };
  }
  const quarantineDirectory = path.join(
    backupDir,
    'quarantine',
    timestamp,
  );
  fs.mkdirSync(quarantineDirectory, { recursive: true });
  const moved = [];
  try {
    for (const fileName of candidates) {
      const source = path.join(backupDir, fileName);
      const destination = path.join(quarantineDirectory, fileName);
      fs.renameSync(source, destination);
      moved.push({ fileName, source, destination });
    }
  } catch (error) {
    for (const file of moved.reverse()) {
      if (fs.existsSync(file.destination)) fs.renameSync(file.destination, file.source);
    }
    throw error;
  }
  return {
    quarantineDirectory: path.relative(PROJECT_ROOT, quarantineDirectory),
    quarantinedFiles: moved.map((file) => file.fileName),
    rollback: () => {
      for (const file of [...moved].reverse()) {
        if (fs.existsSync(file.destination)) fs.renameSync(file.destination, file.source);
      }
    },
  };
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function writeEvidence(evidence, outputArg) {
  const outputPath = outputArg
    ? path.resolve(PROJECT_ROOT, outputArg)
    : path.join(
        PROJECT_ROOT,
        'release-evidence',
        `data-retention-${safeTimestamp(new Date(evidence.startedAt))}.json`,
      );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return outputPath;
}

async function previewOperation(connection, operation) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS candidate_rows FROM \`${operation.table}\` WHERE ${operation.where}`,
  );
  return Number(rows[0]?.candidate_rows || 0);
}

async function applyOperation(connection, operation) {
  const candidateRows = await previewOperation(connection, operation);
  const [result] = await connection.query(
    `DELETE FROM \`${operation.table}\` WHERE ${operation.where}`,
  );
  return {
    candidateRows,
    deletedRows: Number(result.affectedRows || 0),
  };
}

export async function runDataRetention(argv = process.argv.slice(2)) {
  const args = parseRetentionArgs(argv);
  const policy = buildRetentionPolicy();
  const config = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(config);
  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: config.connectTimeout,
  });
  const evidence = {
    schemaVersion: 2,
    startedAt: new Date().toISOString(),
    completedAt: null,
    mode: args.apply ? 'apply' : 'preview',
    database: { host: config.host, port: config.port, name: config.database },
    policy: {
      auditDays: policy.auditDays,
      securityAuditDays: policy.securityAuditDays,
      notificationDays: policy.notificationDays,
      backupDays: policy.backupDays,
      protectedTables: policy.protectedTables,
    },
    summary: null,
    results: [],
  };
  const backupDir = path.join(PROJECT_ROOT, 'backups');
  const backupInspection = inspectManagedBackups(backupDir, policy.backupDays);
  let rollbackBackupQuarantine = () => undefined;
  try {
    if (args.apply) await connection.beginTransaction();
    try {
      for (const operation of policy.operations) {
        if (args.apply) {
          const result = await applyOperation(connection, operation);
          evidence.results.push({
            id: operation.id,
            table: operation.table,
            days: operation.days,
            status: 'passed',
            ...result,
          });
        } else {
          const candidateRows = await previewOperation(connection, operation);
          evidence.results.push({
            id: operation.id,
            table: operation.table,
            days: operation.days,
            status: 'passed',
            candidateRows,
            deletedRows: 0,
          });
        }
      }
      const backupCandidates = [...new Set([
        ...backupInspection.invalidFiles,
        ...backupInspection.expiredFiles,
      ])];
      const backupResult = args.apply
        ? quarantineManagedBackups(
            backupDir,
            backupInspection,
            safeTimestamp(new Date(evidence.startedAt)),
          )
        : {
            quarantineDirectory: null,
            quarantinedFiles: [],
            rollback: () => undefined,
          };
      rollbackBackupQuarantine = backupResult.rollback;
      evidence.results.push({
        id: 'managed-backups',
        directory: 'backups',
        days: policy.backupDays,
        status: 'passed',
        inspectedFiles: backupInspection.files.length,
        candidateFiles: backupCandidates.length,
        invalidFiles: backupInspection.invalidFiles,
        expiredFiles: backupInspection.expiredFiles,
        quarantinedFiles: backupResult.quarantinedFiles.length,
        quarantinedFileNames: backupResult.quarantinedFiles,
        quarantineDirectory: backupResult.quarantineDirectory,
        candidateRows: 0,
        deletedRows: 0,
      });
      if (args.apply) {
        await connection.query(
          `INSERT INTO audit_logs (action, details, performed_by)
           VALUES ('data_retention_applied', ?, 'system')`,
          [JSON.stringify({
            policy: evidence.policy,
            results: evidence.results.map((result) => ({
              id: result.id,
              deletedRows: result.deletedRows,
              quarantinedFiles: result.quarantinedFiles || 0,
            })),
          })],
        );
        await connection.commit();
        rollbackBackupQuarantine = () => undefined;
      }
    } catch (error) {
      if (args.apply) await connection.rollback();
      try {
        rollbackBackupQuarantine();
      } catch (rollbackError) {
        evidence.results.push({
          id: 'backup-quarantine-rollback',
          status: 'failed',
          reason: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      evidence.results.push({
        id: 'retention-execution',
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    evidence.summary = summarizeRetentionResults(evidence.results, args.apply);
    evidence.completedAt = new Date().toISOString();
    const outputPath = writeEvidence(evidence, args.output);
    if (args.json) console.log(JSON.stringify(evidence, null, 2));
    else {
      console.log('PowerGym data retention');
      console.log('-----------------------');
      console.log(`Mode: ${evidence.mode}`);
      for (const result of evidence.results) {
        if (result.id === 'managed-backups') {
          console.log(
            `[${result.status.toUpperCase()}] ${result.id}: `
            + `${result.inspectedFiles} inspected, ${result.candidateFiles} candidates, `
            + `${result.quarantinedFiles} quarantined`,
          );
          for (const fileName of result.invalidFiles || []) {
            console.log(`  invalid: ${fileName}`);
          }
          for (const fileName of result.expiredFiles || []) {
            console.log(`  expired: ${fileName}`);
          }
          if (result.quarantineDirectory) {
            console.log(`  quarantine: ${result.quarantineDirectory}`);
          }
          continue;
        }
        console.log(
          `[${result.status.toUpperCase()}] ${result.id}: `
          + `${result.candidateRows || 0} candidates, ${result.deletedRows || 0} deleted`,
        );
      }
      console.log(`Evidence: ${outputPath}`);
      console.log(`Posture: ${evidence.summary.posture}`);
    }
    return { evidence, outputPath };
  } finally {
    await connection.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runDataRetention()
    .then(({ evidence }) => {
      if (evidence.summary.posture === 'block') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`Data retention failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
