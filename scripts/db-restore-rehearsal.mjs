#!/usr/bin/env node
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getDatabaseEnv } from './db-env.mjs';
import {
  parseReleaseGateArgs,
  redactEvidenceText,
  resolveNpmInvocation,
} from './release-gate.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REHEARSAL_CONFIRMATION = 'RESTORE_REHEARSAL';
const OUTPUT_TAIL_LIMIT = 64 * 1024;

function appendTail(current, chunk) {
  const combined = `${current}${chunk}`;
  return combined.length > OUTPUT_TAIL_LIMIT ? combined.slice(-OUTPUT_TAIL_LIMIT) : combined;
}

function envValue(env, key) {
  return String(env[key] || '').trim();
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getRehearsalDatabaseEnv(env = process.env) {
  return {
    host: envValue(env, 'REHEARSAL_DATABASE_HOSTNAME'),
    port: Number(envValue(env, 'REHEARSAL_DATABASE_PORT') || 3306),
    user: envValue(env, 'REHEARSAL_DATABASE_USER_NAME'),
    password: String(env.REHEARSAL_DATABASE_PASSWORD || ''),
    database: envValue(env, 'REHEARSAL_DATABASE_NAME'),
  };
}

function databaseIdentity(db) {
  return `${String(db.host || '').trim().toLowerCase()}:${Number(db.port || 3306)}/${String(db.database || '').trim().toLowerCase()}`;
}

function isClearlyIsolatedName(name) {
  return /(?:rehearsal|restore|sandbox|staging|test)/i.test(String(name || ''));
}

export function normalizeManagedBackupName(input) {
  const normalized = String(input || '').trim().replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) || '';
}

/**
 * @param {{
 *   args?: Record<string, any>,
 *   env?: NodeJS.ProcessEnv,
 *   productionDb?: Record<string, any>
 * }} [options]
 */
export function buildRestoreRehearsalPlan({
  args = {},
  env = process.env,
  productionDb = getDatabaseEnv(),
} = {}) {
  const rehearsalDb = getRehearsalDatabaseEnv(env);
  const requestedBackup = String(args.backup || args._?.[0] || '').trim();
  const backup = normalizeManagedBackupName(requestedBackup);
  const dryRun = Boolean(args['dry-run']);
  const confirmation = String(args.confirm || '');
  const blockers = [];
  const required = [
    ['REHEARSAL_DATABASE_HOSTNAME', rehearsalDb.host],
    ['REHEARSAL_DATABASE_USER_NAME', rehearsalDb.user],
    ['REHEARSAL_DATABASE_PASSWORD', rehearsalDb.password],
    ['REHEARSAL_DATABASE_NAME', rehearsalDb.database],
  ];
  for (const [key, value] of required) {
    if (!value) blockers.push(`${key} is required.`);
  }
  if (!backup) blockers.push('--backup=<managed-backup.sql> is required.');
  if (!Number.isInteger(rehearsalDb.port) || rehearsalDb.port < 1 || rehearsalDb.port > 65535) {
    blockers.push('REHEARSAL_DATABASE_PORT must be between 1 and 65535.');
  }
  if (rehearsalDb.database && !isClearlyIsolatedName(rehearsalDb.database)) {
    blockers.push('REHEARSAL_DATABASE_NAME must contain rehearsal, restore, sandbox, staging or test.');
  }
  if (databaseIdentity(rehearsalDb) === databaseIdentity(productionDb)) {
    blockers.push('Rehearsal target must not match the configured application database.');
  }
  if (rehearsalDb.database
    && productionDb.database
    && rehearsalDb.database.toLowerCase() === String(productionDb.database).trim().toLowerCase()) {
    blockers.push('Rehearsal database name must differ from the application database name.');
  }
  if (!dryRun && confirmation !== REHEARSAL_CONFIRMATION) {
    blockers.push(`Execution requires --confirm=${REHEARSAL_CONFIRMATION}.`);
  }

  const npm = resolveNpmInvocation(env);
  const npmStep = (id, npmArgs, options = {}) => ({
    id,
    command: npm.command,
    args: [...npm.prefixArgs, ...npmArgs],
    ...options,
  });
  const steps = backup
    ? [
        npmStep(
          'inspect-backup',
          ['run', 'db:restore', '--', `--backup=${backup}`, '--inspect', '--json'],
          { runInDryRun: true },
        ),
        npmStep('restore-isolated-database', [
          'run',
          'db:restore',
          '--',
          `--backup=${backup}`,
          '--apply',
          '--confirm=RESTORE',
          '--allow-destructive',
        ]),
        npmStep('verify-restored-database', ['run', 'db:verify']),
        npmStep('verify-restored-integrity', ['run', 'db:integrity', '--', '--json']),
      ]
    : [];

  return {
    dryRun,
    canRun: blockers.length === 0,
    blockers,
    confirmationRequired: REHEARSAL_CONFIRMATION,
    requestedBackup,
    backup,
    target: {
      host: rehearsalDb.host,
      port: rehearsalDb.port,
      database: rehearsalDb.database,
      userConfigured: Boolean(rehearsalDb.user),
      passwordConfigured: Boolean(rehearsalDb.password),
    },
    childEnv: {
      ...env,
      NODE_ENV: 'test',
      DATABASE_HOSTNAME: rehearsalDb.host,
      DATABASE_PORT: String(rehearsalDb.port),
      DATABASE_USER_NAME: rehearsalDb.user,
      DATABASE_PASSWORD: rehearsalDb.password,
      DATABASE_NAME: rehearsalDb.database,
      DB_HOST: '',
      DB_PORT: '',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_NAME: '',
      DATABASE_RESTORE_ALLOW_PRODUCTION: 'false',
      DATABASE_RESTORE_ALLOW_DESTRUCTIVE: 'true',
    },
    steps,
  };
}

async function runStep(step, childEnv, dryRun) {
  const startedAt = new Date();
  if (dryRun && !step.runInDryRun) {
    return {
      id: step.id,
      status: 'dry-run',
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
      durationMs: 0,
    };
  }
  return new Promise((resolve) => {
    let stdoutTail = '';
    let stderrTail = '';
    let child;
    try {
      child = spawn(step.command, step.args, {
        cwd: PROJECT_ROOT,
        env: childEnv,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const completedAt = new Date();
      resolve({
        id: step.id,
        status: 'failed',
        exitCode: null,
        error: error instanceof Error ? error.message : String(error),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      });
      return;
    }
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      stdoutTail = appendTail(stdoutTail, chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      stderrTail = appendTail(stderrTail, chunk.toString());
    });
    child.once('error', (error) => {
      const completedAt = new Date();
      resolve({
        id: step.id,
        status: 'failed',
        exitCode: null,
        error: error.message,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdoutTail: redactEvidenceText(stdoutTail),
        stderrTail: redactEvidenceText(stderrTail),
      });
    });
    child.once('close', (code) => {
      const completedAt = new Date();
      resolve({
        id: step.id,
        status: code === 0 ? 'passed' : 'failed',
        exitCode: code,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdoutTail: redactEvidenceText(stdoutTail),
        stderrTail: redactEvidenceText(stderrTail),
      });
    });
  });
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function writeEvidence(evidence, outputArg) {
  const outputPath = outputArg
    ? path.resolve(PROJECT_ROOT, String(outputArg))
    : path.join(PROJECT_ROOT, 'release-evidence', `restore-rehearsal-${safeTimestamp(new Date(evidence.startedAt))}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return outputPath;
}

export async function runRestoreRehearsal(argv = process.argv.slice(2), env = process.env) {
  const args = parseReleaseGateArgs(argv);
  const plan = buildRestoreRehearsalPlan({ args, env });
  const evidence = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    posture: plan.canRun ? 'running' : 'block',
    dryRun: plan.dryRun,
    backup: plan.backup,
    target: plan.target,
    blockers: plan.blockers,
    steps: [],
  };

  if (plan.canRun) {
    for (const step of plan.steps) {
      console.log(`\n==> ${step.id}`);
      const result = await runStep(step, plan.childEnv, plan.dryRun);
      evidence.steps.push(result);
      if (result.status === 'failed') break;
    }
    evidence.posture = evidence.steps.some((step) => step.status === 'failed')
      ? 'block'
      : plan.dryRun
        ? 'dry-run'
        : 'pass';
  }
  evidence.completedAt = new Date().toISOString();
  const outputPath = writeEvidence(evidence, args.output);
  console.log(`\nRestore rehearsal evidence: ${outputPath}`);
  console.log(`Posture: ${evidence.posture}`);
  for (const blocker of plan.blockers) console.error(`BLOCKER: ${blocker}`);
  return { evidence, outputPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = await runRestoreRehearsal();
    if (result.evidence.posture === 'block') process.exitCode = 1;
  } catch (error) {
    console.error(`Restore rehearsal failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
