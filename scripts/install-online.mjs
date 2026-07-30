#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveNpmInvocation } from './release-gate.mjs';

const SERVICE_NAME = 'PowerGym';
const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseInstallerArgs(argv = process.argv.slice(2)) {
  const result = { windows: false, linux: false, dryRun: false, installService: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '-w') result.windows = true;
    else if (token === '-l') result.linux = true;
    else if (token === '--dry-run') result.dryRun = true;
    else if (token === '--install-service') result.installService = true;
    else if (token === '--skip-service') result.installService = false;
    else if (token.startsWith('--')) {
      const [name, inlineValue] = token.slice(2).split('=', 2);
      const value = inlineValue ?? argv[++index];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for --${name}`);
      result[name.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (result.windows === result.linux) throw new Error('Select exactly one operating system: -w for Windows or -l for Linux.');
  return result;
}

export function buildPublicUrl(args) {
  const explicit = String(args.baseUrl || '').trim();
  if (explicit) return new URL(explicit).toString().replace(/\/$/, '');
  const port = Number(args.port || process.env.PORT || 3000);
  if (args.domain) return `https://${String(args.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  if (args.ip) {
    const protocol = args.protocol === 'https' ? 'https' : 'http';
    const defaultPort = protocol === 'https' ? 443 : 80;
    return `${protocol}://${String(args.ip).replace(/^https?:\/\//, '').replace(/\/+$/, '')}${port === defaultPort ? '' : `:${port}`}`;
  }
  throw new Error('Provide --domain, --ip or --base-url for the online installation.');
}

function parseEnv(text) {
  const values = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1));
  }
  return values;
}

export function updateEnvText(existingText, updates) {
  const lines = String(existingText || '').split(/\r?\n/);
  const pending = new Map(Object.entries(updates));
  const output = lines.map((line) => {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) return line;
    const key = line.slice(0, line.indexOf('=')).trim();
    if (!pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of pending) output.push(`${key}=${value}`);
  return `${output.filter((line, index, all) => line || index < all.length - 1).join('\n')}\n`;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || PROJECT_DIR,
      env: options.env || process.env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function command(command, args, options) {
  if (options.dryRun) {
    console.log(`[dry-run] ${command} ${args.join(' ')}`);
    return;
  }
  await run(command, args, options);
}

async function prepareEnvironment(args, publicUrl) {
  const envPath = path.join(PROJECT_DIR, '.env');
  let current = '';
  try {
    current = await fs.readFile(envPath, 'utf8');
  } catch {
    current = await fs.readFile(path.join(PROJECT_DIR, '.env.example'), 'utf8');
  }
  const currentValues = parseEnv(current);
  const configuredValue = (...keys) => keys
    .map((key) => process.env[key] || currentValues.get(key) || '')
    .find((value) => value && !/^replace_/i.test(value));
  const databaseKeys = [
    ['DATABASE_HOSTNAME', 'DB_HOST'],
    ['DATABASE_USER_NAME', 'DB_USER'],
    ['DATABASE_PASSWORD', 'DB_PASSWORD'],
    ['DATABASE_NAME', 'DB_NAME'],
  ];
  const missingDatabaseKeys = databaseKeys
    .filter((keys) => !configuredValue(...keys))
    .map((keys) => keys.join(' or '));
  if (missingDatabaseKeys.length) {
    throw new Error(`Configure the database before installation. Missing: ${missingDatabaseKeys.join(', ')}`);
  }

  const initialAdminPassword = configuredValue('POWERGYM_INITIAL_ADMIN_PASSWORD');
  if (!initialAdminPassword || String(initialAdminPassword).length < 10) {
    throw new Error('Configure POWERGYM_INITIAL_ADMIN_PASSWORD with at least 10 characters before installation.');
  }

  const secureUrl = publicUrl.startsWith('https://');
  const updates = {
    NODE_ENV: 'production',
    PORT: String(args.port || process.env.PORT || 3000),
    JWT_SECRET: process.env.JWT_SECRET || currentValues.get('JWT_SECRET')?.replace(/^replace_.+$/, '') || crypto.randomBytes(48).toString('base64url'),
    PASSWORD_RESET_TOKEN_PEPPER: process.env.PASSWORD_RESET_TOKEN_PEPPER || currentValues.get('PASSWORD_RESET_TOKEN_PEPPER')?.replace(/^replace_.+$/, '') || crypto.randomBytes(48).toString('base64url'),
    PASSWORD_RESET_EXPOSE_DEV_TOKEN: 'false',
    ADMIN_SETUP_ENABLED: 'false',
    ALLOW_ENV_BOOTSTRAP_LOGIN: 'false',
    API_PUBLIC_BASE_URL: publicUrl,
    DEPLOY_BASE_URL: publicUrl,
    PUBLIC_APP_ORIGIN: publicUrl,
    ALLOWED_ORIGINS: publicUrl,
    PASSWORD_RESET_PUBLIC_BASE_URL: publicUrl,
    GOOGLE_OAUTH_REDIRECT_URI: `${publicUrl}/api/auth/google/callback`,
    SESSION_COOKIE_SECURE: secureUrl ? 'true' : 'false',
    POWERGYM_INSTALL_DIR: PROJECT_DIR,
  };
  const next = updateEnvText(current, updates);
  if (args.dryRun) {
    console.log(`[dry-run] would configure ${envPath} for ${publicUrl}`);
    return { ...process.env, ...Object.fromEntries(parseEnv(next)) };
  }
  await fs.writeFile(envPath, next, { mode: 0o600 });
  return { ...process.env, ...Object.fromEntries(parseEnv(next)) };
}

async function installLinuxService(args, env) {
  const nodePath = process.execPath;
  const envPath = path.join(PROJECT_DIR, '.env');
  const unit = `[Unit]
Description=PowerGym Management
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${envPath}
ExecStart=${nodePath} ${path.join(PROJECT_DIR, 'scripts', 'service-runner.mjs')}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
  const healthUnit = `[Unit]
Description=PowerGym post-installation health check
After=powergym.service

[Service]
Type=oneshot
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${envPath}
ExecStart=${nodePath} ${path.join(PROJECT_DIR, 'scripts', 'monitor-installation.mjs')}
`;
  const timer = `[Unit]
Description=Run PowerGym health check every five minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
`;
  const serviceDir = path.resolve(args.serviceDir || path.join(os.homedir(), '.config', 'systemd', 'user'));
  if (args.dryRun) {
    console.log(`[dry-run] would install user services in ${serviceDir}`);
    return;
  }
  await fs.mkdir(serviceDir, { recursive: true });
  await fs.writeFile(path.join(serviceDir, 'powergym.service'), unit);
  await fs.writeFile(path.join(serviceDir, 'powergym-health.service'), healthUnit);
  await fs.writeFile(path.join(serviceDir, 'powergym-health.timer'), timer);
  await command('systemctl', ['--user', 'daemon-reload'], { ...args, env });
  await command('systemctl', ['--user', 'enable', '--now', 'powergym.service', 'powergym-health.timer'], { ...args, env });
}

async function installWindowsService(args, env) {
  const runner = `"${process.execPath}" "${path.join(PROJECT_DIR, 'scripts', 'service-runner.mjs')}"`;
  const monitor = `"${process.execPath}" "${path.join(PROJECT_DIR, 'scripts', 'monitor-installation.mjs')}"`;
  await command('schtasks.exe', ['/Create', '/F', '/TN', SERVICE_NAME, '/SC', 'ONLOGON', '/TR', runner], { ...args, env });
  await command('schtasks.exe', ['/Create', '/F', '/TN', `${SERVICE_NAME}-Health`, '/SC', 'MINUTE', '/MO', '5', '/TR', monitor], { ...args, env });
  await command('schtasks.exe', ['/Run', '/TN', SERVICE_NAME], { ...args, env });
}

export async function install(argv = process.argv.slice(2)) {
  const args = parseInstallerArgs(argv);
  const expectedPlatform = args.windows ? 'win32' : 'linux';
  if (process.platform !== expectedPlatform && !args.dryRun) {
    throw new Error(`Selected ${args.windows ? 'Windows' : 'Linux'} but this host is ${process.platform}.`);
  }
  const publicUrl = buildPublicUrl(args);
  const env = await prepareEnvironment(args, publicUrl);
  const npm = resolveNpmInvocation(env, expectedPlatform);

  console.log(`Installing PowerGym for ${args.windows ? 'Windows' : 'Linux'} at ${publicUrl}`);
  await command(npm.command, [...npm.prefixArgs, 'ci'], { ...args, env });
  await command(npm.command, [...npm.prefixArgs, 'run', 'db:migrate'], { ...args, env });
  await command(npm.command, [...npm.prefixArgs, 'run', 'db:init-users'], { ...args, env });
  await command(npm.command, [...npm.prefixArgs, 'run', 'build'], { ...args, env });
  await command(npm.command, [...npm.prefixArgs, 'run', 'deploy:check'], { ...args, env });

  if (args.installService) {
    if (args.windows) await installWindowsService(args, env);
    else await installLinuxService(args, env);
  }

  console.log('PowerGym installation completed.');
  console.log('Required accounts verified: admin@powergym.local and super_admin@powergym.local');
  console.warn('Security action required: rotate the initial administrator password immediately after first login.');
  console.log(`Health monitor target: ${publicUrl}/api/health`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  install().catch((error) => {
    console.error(`Installation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
