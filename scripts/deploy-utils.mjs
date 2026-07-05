import fs from 'node:fs';
import path from 'node:path';
import { envFirst, getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

export function parseCliArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');
    if (equalsIndex >= 0) {
      args[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[withoutPrefix] = next;
      index += 1;
    } else {
      args[withoutPrefix] = true;
    }
  }
  return args;
}

export function boolEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function maskSecret(value) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= 6) return '***';
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

export function makeSafeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function makeBackupFileName({ database, label = 'predeploy', date = new Date() }) {
  const safeDatabase = String(database || 'database').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeLabel = String(label || 'backup').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeDatabase}_${safeLabel}_${makeSafeTimestamp(date)}.sql`;
}

export function resolveBackupPath({ outputDir = 'backups', database, label = 'predeploy', date = new Date(), explicitOutput = '' }) {
  const target = explicitOutput || path.join(outputDir, makeBackupFileName({ database, label, date }));
  return path.resolve(process.cwd(), target);
}

export function buildMysqldumpArgs(config, extraArgs = []) {
  return [
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--events',
    '-h', config.host,
    '-P', String(config.port || 3306),
    '-u', config.user,
    ...extraArgs,
    config.database,
  ].filter(Boolean);
}

export function getOperationalConfig(env = process.env) {
  const db = getDatabaseEnv();
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: env.PORT || '3000',
    jwtSecret: env.JWT_SECRET || '',
    adminSetupToken: env.ADMIN_SETUP_TOKEN || '',
    adminSetupEnabled: env.ADMIN_SETUP_ENABLED || '',
    envBootstrapLogin: env.ALLOW_ENV_BOOTSTRAP_LOGIN || '',
    apiDocsInProduction: env.ENABLE_API_DOCS_IN_PRODUCTION || '',
    allowedOrigins: env.ALLOWED_ORIGINS || '',
    passwordResetPublicBaseUrl: env.PASSWORD_RESET_PUBLIC_BASE_URL || '',
    passwordResetExposeDevToken: env.PASSWORD_RESET_EXPOSE_DEV_TOKEN || '',
    passwordResetEmailProvider: env.PASSWORD_RESET_EMAIL_PROVIDER || 'disabled',
    passwordResetSmsProvider: env.PASSWORD_RESET_SMS_PROVIDER || 'disabled',
    passwordResetTokenPepper: env.PASSWORD_RESET_TOKEN_PEPPER || '',
    backupDir: env.DATABASE_BACKUP_DIR || 'backups',
    backupRetentionDays: Number(env.DATABASE_BACKUP_RETENTION_DAYS || 30),
    db,
    missingDb: getMissingDatabaseEnv(db),
  };
}

export function validateProductionConfig(config = getOperationalConfig()) {
  const checks = [];
  const production = config.nodeEnv === 'production';

  const add = (id, ok, severity, message, recommendation = '') => {
    checks.push({ id, ok: Boolean(ok), severity, message, recommendation });
  };

  add('node-env', Boolean(config.nodeEnv), 'critical', `NODE_ENV is ${config.nodeEnv || 'not set'}`, 'Set NODE_ENV=production in production.');
  add('database-env', config.missingDb.length === 0, 'critical', config.missingDb.length === 0 ? 'Database environment variables are present.' : `Missing database variables: ${config.missingDb.join(', ')}`, 'Set DATABASE_HOSTNAME, DATABASE_USER_NAME, DATABASE_PASSWORD and DATABASE_NAME.');
  add('jwt-secret', !production || config.jwtSecret.length >= 32, 'critical', production ? 'JWT_SECRET must be at least 32 characters.' : 'JWT_SECRET length is only enforced in production.', 'Use a long random secret and rotate it through your secrets manager.');
  const adminSetupEnabled = boolEnv(config.adminSetupEnabled);
  add('admin-setup-token', !production || !adminSetupEnabled || config.adminSetupToken.length >= 24, 'warning', production ? 'ADMIN_SETUP_TOKEN is required only when ADMIN_SETUP_ENABLED=true.' : 'ADMIN_SETUP_TOKEN is optional outside production.', 'Configure a one-time token only for bootstrap and disable ADMIN_SETUP_ENABLED after use.');
  add('admin-setup-disabled', !production || !adminSetupEnabled, 'warning', production ? 'ADMIN_SETUP_ENABLED should be false after first admin bootstrap.' : 'Admin setup is flexible outside production.', 'Set ADMIN_SETUP_ENABLED=false after setup completes.');
  add('env-bootstrap-login-disabled', !production || !boolEnv(config.envBootstrapLogin), 'critical', production ? 'ALLOW_ENV_BOOTSTRAP_LOGIN must remain false in production.' : 'Environment bootstrap login is flexible outside production.', 'Persist admin users in the database and set ALLOW_ENV_BOOTSTRAP_LOGIN=false.');
  add('api-docs-hidden', !production || !boolEnv(config.apiDocsInProduction), 'warning', production ? 'API docs should not be publicly exposed by default.' : 'API docs are available outside production.', 'Keep ENABLE_API_DOCS_IN_PRODUCTION=false unless docs are behind additional controls.');
  add('allowed-origins', !production || config.allowedOrigins.includes('https://'), 'critical', production ? 'ALLOWED_ORIGINS should include the production HTTPS origin.' : 'ALLOWED_ORIGINS is flexible outside production.', 'Set ALLOWED_ORIGINS=https://your-domain.example.');
  add('reset-base-url', !production || config.passwordResetPublicBaseUrl.startsWith('https://'), 'critical', production ? 'PASSWORD_RESET_PUBLIC_BASE_URL must be HTTPS.' : 'Password reset public base URL is only strictly validated in production.', 'Set PASSWORD_RESET_PUBLIC_BASE_URL=https://your-domain.example.');
  add('reset-token-pepper', !production || config.passwordResetTokenPepper.length >= 32, 'critical', production ? 'PASSWORD_RESET_TOKEN_PEPPER must be at least 32 characters.' : 'PASSWORD_RESET_TOKEN_PEPPER length is only enforced in production.', 'Use a long random value different from JWT_SECRET.');
  add('reset-preview-disabled', !production || !boolEnv(config.passwordResetExposeDevToken), 'critical', production ? 'PASSWORD_RESET_EXPOSE_DEV_TOKEN must be false.' : 'Reset preview token may be enabled for development.', 'Set PASSWORD_RESET_EXPOSE_DEV_TOKEN=false in production.');
  add('reset-delivery-provider', !production || config.passwordResetEmailProvider !== 'disabled' || config.passwordResetSmsProvider !== 'disabled', 'warning', 'At least one reset delivery provider should be enabled in production.', 'Use SendGrid, Twilio or webhooks for reset delivery.');
  add('backup-retention', Number.isFinite(config.backupRetentionDays) && config.backupRetentionDays >= 7, 'warning', `Database backup retention is ${config.backupRetentionDays} days.`, 'Keep at least 7 days locally plus managed provider backups.');

  const summary = {
    total: checks.length,
    failed: checks.filter((item) => !item.ok).length,
    criticalFailed: checks.filter((item) => !item.ok && item.severity === 'critical').length,
    warningFailed: checks.filter((item) => !item.ok && item.severity === 'warning').length,
    posture: checks.some((item) => !item.ok && item.severity === 'critical') ? 'block' : checks.some((item) => !item.ok) ? 'warn' : 'pass',
  };

  return { summary, checks };
}

export function pruneOldBackups({ directory, retentionDays, now = Date.now(), fsModule = fs }) {
  if (!directory || !fsModule.existsSync(directory)) return [];
  const cutoff = now - Number(retentionDays) * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const file of fsModule.readdirSync(directory)) {
    if (!file.endsWith('.sql')) continue;
    const fullPath = path.join(directory, file);
    const stat = fsModule.statSync(fullPath);
    if (stat.mtimeMs < cutoff) {
      fsModule.unlinkSync(fullPath);
      removed.push(fullPath);
    }
  }
  return removed;
}

export function normalizeBaseUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) throw new Error('A base URL is required. Pass --base-url or set DEPLOY_BASE_URL.');
  return text;
}

export function redactHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|cookie|token|secret|password/i.test(key)) {
      result[key] = maskSecret(String(value));
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function buildSmokeChecks({ baseUrl, includeDb = false, includeReadiness = false }) {
  const checks = [
    { id: 'health', url: `${baseUrl}/api/health`, expectedStatuses: [200], required: true },
  ];
  if (includeDb) {
    checks.push({ id: 'db-health', url: `${baseUrl}/api/db-health`, expectedStatuses: [200, 503], required: true });
  }
  if (includeReadiness) {
    checks.push({ id: 'deployment-readiness', url: `${baseUrl}/api/engagement/deployment-readiness`, expectedStatuses: [200, 401, 403], required: false });
    checks.push({ id: 'production-readiness', url: `${baseUrl}/api/platform/production-readiness`, expectedStatuses: [200, 401, 403], required: false });
  }
  return checks;
}

export function summarizeSmokeResults(results) {
  const failed = results.filter((item) => !item.ok && item.required !== false);
  return {
    total: results.length,
    failed: failed.length,
    optionalFailed: results.filter((item) => !item.ok && item.required === false).length,
    posture: failed.length > 0 ? 'fail' : 'pass',
  };
}

export function getDatabaseEnvForBackup() {
  const db = getDatabaseEnv();
  return {
    ...db,
    password: envFirst('DATABASE_PASSWORD', 'DB_PASSWORD'),
  };
}
