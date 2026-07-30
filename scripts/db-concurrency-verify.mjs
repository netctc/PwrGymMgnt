#!/usr/bin/env node
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TIMEOUT_SECONDS = 2;

export const CONCURRENCY_PROBES = Object.freeze([
  {
    id: 'subscription-renewal',
    table: 'subscriptions',
    sourceFile: 'server/subscriptionsV2.ts',
  },
  {
    id: 'subscription-payment',
    table: 'invoices',
    sourceFile: 'server/membership.ts',
  },
  {
    id: 'trainer-commission',
    table: 'trainer_plan_commissions',
    sourceFile: 'server/trainerCommissions.ts',
  },
  {
    id: 'session-ledger',
    table: 'session_balances',
    sourceFile: 'server/sessionLedger.ts',
  },
]);

export function parseConcurrencyArgs(argv = process.argv.slice(2)) {
  const args = {
    json: false,
    output: '',
    rehearsal: false,
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--rehearsal') {
      args.rehearsal = true;
      continue;
    }
    const [name, inlineValue] = token.startsWith('--')
      ? token.slice(2).split('=', 2)
      : ['', undefined];
    if (!name) throw new Error(`Unknown option: ${token}`);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (name === 'output') args.output = String(value || '');
    else if (name === 'lock-timeout') args.timeoutSeconds = Number(value);
    else throw new Error(`Unknown option: --${name}`);
  }
  if (!Number.isInteger(args.timeoutSeconds)
    || args.timeoutSeconds < 1
    || args.timeoutSeconds > 10) {
    throw new Error('--lock-timeout must be an integer between 1 and 10 seconds.');
  }
  return args;
}

export function getConcurrencyDatabaseEnv(args, env = process.env) {
  if (!args.rehearsal) return getDatabaseEnv();
  return {
    host: String(env.REHEARSAL_DATABASE_HOSTNAME || '').trim(),
    port: Number(env.REHEARSAL_DATABASE_PORT || 3306),
    user: String(env.REHEARSAL_DATABASE_USER_NAME || '').trim(),
    password: String(env.REHEARSAL_DATABASE_PASSWORD || ''),
    database: String(env.REHEARSAL_DATABASE_NAME || '').trim(),
    connectTimeout: Number(env.DATABASE_CONNECT_TIMEOUT_MS || 10000),
  };
}

export function isExpectedLockContention(error) {
  const candidate = error && typeof error === 'object' ? error : {};
  return candidate.code === 'ER_LOCK_WAIT_TIMEOUT' || Number(candidate.errno) === 1205;
}

export function summarizeConcurrencyResults(results) {
  const passed = results.filter((result) => result.status === 'passed').length;
  const failed = results.filter((result) => result.status === 'failed').length;
  const blocked = results.filter((result) => result.status === 'blocked').length;
  return {
    posture: failed || blocked ? 'block' : 'pass',
    total: results.length,
    passed,
    failed,
    blocked,
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
        `database-concurrency-${safeTimestamp(new Date(evidence.startedAt))}.json`,
      );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return outputPath;
}

async function sourceUsesRowLock(probe) {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, probe.sourceFile), 'utf8');
  return /FOR\s+UPDATE/i.test(source) && /beginTransaction\s*\(/.test(source);
}

async function runProbe(pool, probe, timeoutSeconds) {
  if (!(await sourceUsesRowLock(probe))) {
    return {
      id: probe.id,
      table: probe.table,
      status: 'failed',
      reason: `${probe.sourceFile} does not contain transactional row locking.`,
    };
  }

  const [candidateRows] = await pool.query(`SELECT id FROM \`${probe.table}\` LIMIT 1`);
  if (!Array.isArray(candidateRows) || !candidateRows[0]?.id) {
    return {
      id: probe.id,
      table: probe.table,
      status: 'blocked',
      reason: `No fixture row is available in ${probe.table}.`,
    };
  }

  const first = await pool.getConnection();
  const second = await pool.getConnection();
  const startedAt = Date.now();
  try {
    await first.beginTransaction();
    await second.beginTransaction();
    await second.query('SET SESSION innodb_lock_wait_timeout = ?', [timeoutSeconds]);
    await first.query(
      `SELECT id FROM \`${probe.table}\` WHERE id = ? FOR UPDATE`,
      [candidateRows[0].id],
    );
    try {
      await second.query(
        `SELECT id FROM \`${probe.table}\` WHERE id = ? FOR UPDATE`,
        [candidateRows[0].id],
      );
      return {
        id: probe.id,
        table: probe.table,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        reason: 'A concurrent transaction acquired a row that should have remained locked.',
      };
    } catch (error) {
      if (!isExpectedLockContention(error)) {
        return {
          id: probe.id,
          table: probe.table,
          status: 'failed',
          durationMs: Date.now() - startedAt,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      return {
        id: probe.id,
        table: probe.table,
        status: 'passed',
        durationMs: Date.now() - startedAt,
        protection: 'exclusive-row-lock',
      };
    }
  } finally {
    await Promise.allSettled([first.rollback(), second.rollback()]);
    first.release();
    second.release();
  }
}

export async function runConcurrencyVerification(argv = process.argv.slice(2)) {
  const args = parseConcurrencyArgs(argv);
  const config = getConcurrencyDatabaseEnv(args);
  const missing = getMissingDatabaseEnv(config);
  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: config.connectTimeout,
    connectionLimit: 8,
  });
  const evidence = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    database: {
      host: config.host,
      port: config.port,
      name: config.database,
      mode: args.rehearsal ? 'rehearsal' : 'configured',
    },
    timeoutSeconds: args.timeoutSeconds,
    summary: null,
    results: [],
  };
  try {
    for (const probe of CONCURRENCY_PROBES) {
      evidence.results.push(await runProbe(pool, probe, args.timeoutSeconds));
    }
    evidence.summary = summarizeConcurrencyResults(evidence.results);
    evidence.completedAt = new Date().toISOString();
    const outputPath = writeEvidence(evidence, args.output);
    if (args.json) console.log(JSON.stringify(evidence, null, 2));
    else {
      console.log('PowerGym database concurrency verification');
      console.log('------------------------------------------');
      for (const result of evidence.results) {
        console.log(`[${result.status.toUpperCase()}] ${result.id}: ${result.protection || result.reason}`);
      }
      console.log(`Evidence: ${outputPath}`);
      console.log(`Posture: ${evidence.summary.posture}`);
    }
    return { evidence, outputPath };
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runConcurrencyVerification()
    .then(({ evidence }) => {
      if (evidence.summary.posture !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`Concurrency verification failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
