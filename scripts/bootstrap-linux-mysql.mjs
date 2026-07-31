#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseLinuxBootstrapArgs(argv = process.argv.slice(2)) {
  const args = { database: 'pwrgymdb', user: 'pwrgymdb', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const [name, inlineValue] = token.startsWith('--')
      ? token.slice(2).split('=', 2)
      : ['', undefined];
    if (!name) throw new Error(`Unknown option: ${token}`);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value) throw new Error(`Missing value for --${name}`);
    if (name === 'database') args.database = String(value);
    else if (name === 'user') args.user = String(value);
    else throw new Error(`Unknown option: --${name}`);
  }
  for (const [name, value] of [['database', args.database], ['user', args.user]]) {
    if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`Unsafe MySQL ${name}: ${value}`);
  }
  return args;
}

function parseEnv(text) {
  const values = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return values;
}

export function updateBootstrapEnv(existingText, updates) {
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

function sqlString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function buildBootstrapSql({ database, user, password }) {
  if (!/^[a-zA-Z0-9_]+$/.test(database) || !/^[a-zA-Z0-9_]+$/.test(user)) {
    throw new Error('Unsafe MySQL identifier.');
  }
  const passwordSql = sqlString(password);
  return [
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `CREATE USER IF NOT EXISTS '${user}'@'localhost' IDENTIFIED BY ${passwordSql};`,
    `ALTER USER '${user}'@'localhost' IDENTIFIED BY ${passwordSql};`,
    `GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${user}'@'localhost';`,
    'FLUSH PRIVILEGES;',
  ].join('\n');
}

function runMysql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'mysql',
      ['--protocol=socket', '--user=root', '--batch', '--skip-column-names'],
      { cwd: PROJECT_DIR, stdio: ['pipe', 'inherit', 'inherit'], shell: false },
    );
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mysql exited with code ${code}`));
    });
    child.stdin.end(`${sql}\n`);
  });
}

function configuredValue(values, key) {
  const value = values.get(key) || '';
  return value && !/^replace_/i.test(value) ? value : '';
}

export async function bootstrapLinuxMysql(argv = process.argv.slice(2)) {
  const args = parseLinuxBootstrapArgs(argv);
  if (process.platform !== 'linux' && !args.dryRun) {
    throw new Error(`Linux MySQL bootstrap cannot run on ${process.platform}.`);
  }
  if (!args.dryRun && (typeof process.getuid !== 'function' || process.getuid() !== 0)) {
    throw new Error('Linux MySQL bootstrap must run as root.');
  }
  const envPath = path.join(PROJECT_DIR, '.env');
  let current = '';
  try {
    current = await fs.readFile(envPath, 'utf8');
  } catch {
    try {
      current = await fs.readFile(path.join(PROJECT_DIR, '.env.example'), 'utf8');
    } catch {
      current = '';
    }
  }
  const values = parseEnv(current);
  const initialAdminPassword = String(
    process.env.POWERGYM_INITIAL_ADMIN_PASSWORD
      || configuredValue(values, 'POWERGYM_INITIAL_ADMIN_PASSWORD'),
  );
  if (initialAdminPassword.length < 10) {
    throw new Error('Set POWERGYM_INITIAL_ADMIN_PASSWORD with at least 10 characters for this command.');
  }
  const databasePassword = configuredValue(values, 'DATABASE_PASSWORD')
    || crypto.randomBytes(32).toString('hex');
  const updates = {
    DATABASE_HOSTNAME: 'localhost',
    DATABASE_PORT: '3306',
    DATABASE_USER_NAME: args.user,
    DATABASE_PASSWORD: databasePassword,
    DATABASE_NAME: args.database,
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USER: args.user,
    DB_PASSWORD: databasePassword,
    DB_NAME: args.database,
    POWERGYM_INITIAL_ADMIN_PASSWORD: initialAdminPassword,
    JWT_SECRET: configuredValue(values, 'JWT_SECRET') || crypto.randomBytes(48).toString('base64url'),
    PASSWORD_RESET_TOKEN_PEPPER: configuredValue(values, 'PASSWORD_RESET_TOKEN_PEPPER') || crypto.randomBytes(48).toString('base64url'),
  };
  if (args.dryRun) {
    console.log(`[dry-run] would create local MySQL database ${args.database} and user ${args.user}`);
    console.log(`[dry-run] would update ${envPath} without printing credentials`);
    return;
  }
  await runMysql(buildBootstrapSql({
    database: args.database,
    user: args.user,
    password: databasePassword,
  }));
  await fs.writeFile(envPath, updateBootstrapEnv(current, updates), { mode: 0o600 });
  await fs.chmod(envPath, 0o600);
  console.log(`Local MySQL database ready: ${args.database}@localhost:3306`);
  console.log(`Application database user ready: ${args.user}@localhost`);
  console.log(`Environment updated securely: ${envPath}`);
  console.log('No credentials were printed.');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  bootstrapLinuxMysql().catch((error) => {
    console.error(`Linux MySQL bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
