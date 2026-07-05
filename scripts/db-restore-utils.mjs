import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { envFirst, getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

export const RESTORE_CONFIRMATION = 'RESTORE';

/**
 * @typedef {object} SqlBackupInspection
 * @property {boolean} ok
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {Record<string, number|string|undefined>} metrics
 * @property {string} [preview]
 */

/**
 * @typedef {object} RestoreDbConfig
 * @property {string} host
 * @property {number} [port]
 * @property {string} user
 * @property {string} password
 * @property {string} database
 * @property {number} [connectTimeout]
 */

/**
 * @typedef {object} RestorePlanOptions
 * @property {SqlBackupInspection} [inspection]
 * @property {boolean} [apply]
 * @property {string} [confirmation]
 * @property {boolean} [allowDestructive]
 * @property {boolean} [allowProductionRestore]
 * @property {boolean} [apiRestoreEnabled]
 * @property {string} [nodeEnv]
 * @property {RestoreDbConfig} [db]
 */


export function validateBackupFileName(input) {
  const base = path.basename(String(input || '').trim());
  if (!base || base !== String(input || '').trim()) return '';
  if (base.startsWith('.') || base.includes('..')) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}\.sql$/.test(base)) return '';
  return base;
}

export function resolveManagedBackupPath({ backupDir = 'backups', name, cwd = process.cwd() }) {
  const fileName = validateBackupFileName(name);
  if (!fileName) return null;
  const resolvedDir = path.resolve(cwd, backupDir);
  const filePath = path.resolve(resolvedDir, fileName);
  if (!filePath.startsWith(`${resolvedDir}${path.sep}`)) return null;
  return { fileName, filePath, backupDir: resolvedDir };
}

export function listManagedBackups({ backupDir = 'backups', cwd = process.cwd(), fsModule = fs } = {}) {
  const resolvedDir = path.resolve(cwd, backupDir);
  if (!fsModule.existsSync(resolvedDir)) return [];
  return fsModule
    .readdirSync(resolvedDir)
    .map((name) => validateBackupFileName(name))
    .filter(Boolean)
    .map((name) => {
      const filePath = path.join(resolvedDir, name);
      const stat = fsModule.statSync(filePath);
      return {
        name,
        path: filePath,
        size: stat.size,
        createdAt: stat.birthtime,
        modifiedAt: stat.mtime,
      };
    })
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
}

export function sha256File(filePath, fsModule = fs) {
  const hash = crypto.createHash('sha256');
  const fd = fsModule.openSync(filePath, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fsModule.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fsModule.closeSync(fd);
  }
  return hash.digest('hex');
}

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function scanSqlFile({ filePath, fsModule, maxPreviewBytes }) {
  const fd = fsModule.openSync(filePath, 'r');
  const buffer = Buffer.alloc(256 * 1024);
  let preview = '';
  let lineCount = 0;
  const textMetrics = {
    createTableCount: 0,
    alterTableCount: 0,
    insertCount: 0,
    dropTableCount: 0,
    truncateCount: 0,
    deleteCount: 0,
  };
  const blockedHits = new Set();
  const blockedPatterns = [
    [/\bDROP\s+(DATABASE|SCHEMA)\b/g, 'DROP DATABASE/SCHEMA statements are not allowed in managed restore.'],
    [/\bCREATE\s+USER\b/g, 'CREATE USER statements are not allowed in managed restore.'],
    [/\bALTER\s+USER\b/g, 'ALTER USER statements are not allowed in managed restore.'],
    [/\bDROP\s+USER\b/g, 'DROP USER statements are not allowed in managed restore.'],
    [/\bGRANT\b/g, 'GRANT statements are not allowed in managed restore.'],
    [/\bREVOKE\b/g, 'REVOKE statements are not allowed in managed restore.'],
    [/\bSHUTDOWN\b/g, 'SHUTDOWN statements are not allowed in managed restore.'],
    [/^\s*SOURCE\s+/gim, 'SOURCE commands are not allowed in managed restore.'],
    [/^\s*\\\./gim, 'mysql client meta commands are not allowed in managed restore.'],
  ];

  try {
    let bytesRead = 0;
    do {
      bytesRead = fsModule.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead <= 0) break;
      const text = buffer.subarray(0, bytesRead).toString('utf8');
      if (preview.length < maxPreviewBytes) preview += text.slice(0, maxPreviewBytes - preview.length);
      lineCount += countMatches(text, /\n/g);
      const normalized = text.replace(/\/\*![\s\S]*?\*\//g, ' ').toUpperCase();
      for (const [regex, message] of blockedPatterns) {
        regex.lastIndex = 0;
        if (regex.test(text) || regex.test(normalized)) blockedHits.add(message);
      }
      textMetrics.dropTableCount += countMatches(normalized, /\bDROP\s+TABLE\b/g);
      textMetrics.truncateCount += countMatches(normalized, /\bTRUNCATE\s+TABLE\b/g);
      textMetrics.deleteCount += countMatches(normalized, /\bDELETE\s+FROM\b/g);
      textMetrics.createTableCount += countMatches(normalized, /\bCREATE\s+TABLE\b/g);
      textMetrics.insertCount += countMatches(normalized, /\bINSERT\s+INTO\b/g);
      textMetrics.alterTableCount += countMatches(normalized, /\bALTER\s+TABLE\b/g);
    } while (bytesRead > 0);
  } finally {
    fsModule.closeSync(fd);
  }

  return { preview, lineCount: lineCount + 1, textMetrics, blockedMessages: Array.from(blockedHits) };
}

/**
 * Inspect a SQL backup file without executing it.
 *
 * @param {{ filePath?: string, fsModule?: typeof fs, maxPreviewBytes?: number }} [options]
 * @returns {SqlBackupInspection}
 */
export function inspectSqlBackup({ filePath, fsModule = fs, maxPreviewBytes = 512 * 1024 } = {}) {
  if (!filePath) {
    return { ok: false, errors: ['Backup path is required.'], warnings: [], metrics: {}, preview: '' };
  }
  if (!fsModule.existsSync(filePath)) {
    return { ok: false, errors: ['Backup file does not exist.'], warnings: [], metrics: {}, preview: '' };
  }

  const stat = fsModule.statSync(filePath);
  if (!stat.isFile()) {
    return { ok: false, errors: ['Backup path is not a file.'], warnings: [], metrics: {}, preview: '' };
  }
  if (stat.size <= 0) {
    return { ok: false, errors: ['Backup file is empty.'], warnings: [], metrics: { sizeBytes: stat.size }, preview: '' };
  }

  const scan = scanSqlFile({ filePath, fsModule, maxPreviewBytes });
  const preview = scan.preview;
  const errors = [...scan.blockedMessages];
  const warnings = [];

  const {
    dropTableCount,
    truncateCount,
    deleteCount,
    createTableCount,
    insertCount,
    alterTableCount,
  } = scan.textMetrics;

  if (dropTableCount > 0) warnings.push(`Contains ${dropTableCount} DROP TABLE statement(s). Require --allow-destructive to apply.`);
  if (truncateCount > 0) warnings.push(`Contains ${truncateCount} TRUNCATE TABLE statement(s). Require --allow-destructive to apply.`);
  if (deleteCount > 0) warnings.push(`Contains ${deleteCount} DELETE FROM statement(s). Require --allow-destructive to apply.`);
  if (createTableCount === 0 && insertCount === 0 && alterTableCount === 0) {
    warnings.push('No CREATE TABLE, ALTER TABLE or INSERT statements were detected. Verify this is a valid MySQL dump.');
  }

  const lineCount = scan.lineCount;
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      sizeBytes: stat.size,
      lineCount,
      sha256: sha256File(filePath, fsModule),
      createTableCount,
      alterTableCount,
      insertCount,
      dropTableCount,
      truncateCount,
      deleteCount,
      destructiveStatementCount: dropTableCount + truncateCount + deleteCount,
    },
    preview: preview.slice(0, 5000),
  };
}

export function getDatabaseEnvForRestore() {
  const db = getDatabaseEnv();
  return {
    ...db,
    password: envFirst('DATABASE_PASSWORD', 'DB_PASSWORD'),
  };
}

export function buildMysqlRestoreArgs(config, extraArgs = []) {
  return [
    '--binary-mode',
    '--show-warnings',
    '-h', config.host,
    '-P', String(config.port || 3306),
    '-u', config.user,
    ...extraArgs,
    config.database,
  ].filter(Boolean);
}

/**
 * Build a safe restore plan for dry-run or apply mode.
 *
 * @param {RestorePlanOptions} [options]
 */
export function createRestorePlan({
  inspection,
  apply = false,
  confirmation = '',
  allowDestructive = false,
  allowProductionRestore = false,
  apiRestoreEnabled = true,
  nodeEnv = process.env.NODE_ENV || 'development',
  db = getDatabaseEnvForRestore(),
} = {}) {
  const blockers = [];
  const warnings = [...(inspection?.warnings || [])];
  const missingDb = getMissingDatabaseEnv(db);
  const destructiveCount = Number(inspection?.metrics?.destructiveStatementCount || 0);
  const production = nodeEnv === 'production';

  if (!inspection?.ok) blockers.push(...(inspection?.errors || ['Backup inspection failed.']));
  if (missingDb.length > 0) blockers.push(`Missing database environment variables: ${missingDb.join(', ')}`);
  if (apply && confirmation !== RESTORE_CONFIRMATION) blockers.push(`Apply mode requires --confirm=${RESTORE_CONFIRMATION}.`);
  if (apply && destructiveCount > 0 && !allowDestructive) blockers.push('Backup contains destructive table statements. Pass --allow-destructive after reviewing the inspection output.');
  if (apply && production && !allowProductionRestore) blockers.push('Production restore is blocked unless --allow-production-restore or DATABASE_RESTORE_ALLOW_PRODUCTION=true is set.');
  if (apply && !apiRestoreEnabled) blockers.push('Restore apply is disabled by configuration. Enable DATABASE_RESTORE_API_ENABLED=true for API restores or use CLI during a maintenance window.');

  return {
    dryRun: !apply,
    canApply: blockers.length === 0,
    nodeEnv,
    production,
    destructive: destructiveCount > 0,
    destructiveStatementCount: destructiveCount,
    blockers,
    warnings,
    confirmationRequired: RESTORE_CONFIRMATION,
    missingDb,
  };
}
