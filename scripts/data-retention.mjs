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
    schemaVersion: 1,
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
      if (args.apply) {
        await connection.query(
          `INSERT INTO audit_logs (action, details, performed_by)
           VALUES ('data_retention_applied', ?, 'system')`,
          [JSON.stringify({
            policy: evidence.policy,
            results: evidence.results.map((result) => ({
              id: result.id,
              deletedRows: result.deletedRows,
            })),
          })],
        );
        await connection.commit();
      }
    } catch (error) {
      if (args.apply) await connection.rollback();
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
