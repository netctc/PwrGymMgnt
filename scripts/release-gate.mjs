#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT_DIR = 'release-evidence';
const OUTPUT_TAIL_LIMIT = 64 * 1024;

export function parseReleaseGateArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [name, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      args[name] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      args[name] = argv[index + 1];
      index += 1;
    } else {
      args[name] = true;
    }
  }
  return args;
}

function boolArg(value) {
  if (value === undefined || value === false) return false;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

export function normalizeReleaseBaseUrl(input) {
  const value = String(input || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Release smoke URL must use http:// or https://.');
  }
  if (url.username || url.password) {
    throw new Error('Release smoke URL must not contain credentials.');
  }
  return url.toString().replace(/\/+$/, '');
}

export function buildReleaseGatePlan(args = {}, env = process.env) {
  const skipCode = boolArg(args['skip-code']);
  const skipDatabase = boolArg(args['skip-database']);
  const skipSmoke = boolArg(args['skip-smoke']);
  const includeDbSmoke = boolArg(args['include-db-smoke']);
  const baseUrl = normalizeReleaseBaseUrl(args['base-url'] || env.DEPLOY_BASE_URL || '');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const steps = [];

  if (!skipCode) {
    steps.push({ id: 'verify-ci', command: npm, args: ['run', 'verify:ci'] });
  }
  if (!skipDatabase) {
    steps.push(
      { id: 'database-backup', command: npm, args: ['run', 'db:backup', '--', '--label=release-gate'] },
      { id: 'database-migrations', command: npm, args: ['run', 'db:migrate'] },
      { id: 'database-access', command: npm, args: ['run', 'db:verify'] },
      { id: 'database-integrity', command: npm, args: ['run', 'db:integrity', '--', '--json'] },
    );
  }
  if (!skipSmoke) {
    if (!baseUrl) {
      throw new Error('DEPLOY_BASE_URL or --base-url is required. Use --skip-smoke only for an explicitly approved offline run.');
    }
    const smokeArgs = ['run', 'deploy:smoke', '--', '--base-url', baseUrl, '--include-readiness'];
    if (includeDbSmoke) smokeArgs.push('--include-db');
    steps.push({ id: 'external-smoke', command: npm, args: smokeArgs });
  }
  if (steps.length === 0) throw new Error('Release gate has no enabled steps.');
  return { baseUrl, skipCode, skipDatabase, skipSmoke, includeDbSmoke, steps };
}

function appendTail(current, chunk) {
  const combined = `${current}${chunk}`;
  return combined.length > OUTPUT_TAIL_LIMIT ? combined.slice(-OUTPUT_TAIL_LIMIT) : combined;
}

export function redactEvidenceText(input) {
  return String(input || '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"',]+/gi, '$1***')
    .replace(/((?:password|token|secret|mysql_pwd)\s*[:=]\s*)[^\s"',]+/gi, '$1***')
    .replace(/\/\/([^:/\s]+):([^@\s]+)@/g, '//$1:***@');
}

function gitValue(args) {
  const result = spawnSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

export function assertCleanCheckout({ allowDirty = false } = {}) {
  const insideRepository = gitValue(['rev-parse', '--is-inside-work-tree']) === 'true';
  if (!insideRepository) throw new Error('Release gate must run from a Git checkout.');
  const dirty = gitValue(['status', '--porcelain']);
  if (dirty && !allowDirty) {
    throw new Error('Working tree is not clean. Commit/stash local changes or pass --allow-dirty for a documented exception.');
  }
  return {
    commit: gitValue(['rev-parse', 'HEAD']),
    branch: gitValue(['branch', '--show-current']),
    dirty: Boolean(dirty),
  };
}

async function runStep(step, { dryRun = false } = {}) {
  const startedAt = new Date();
  if (dryRun) {
    return {
      id: step.id,
      status: 'dry-run',
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
      durationMs: 0,
    };
  }
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutTail = '';
    let stderrTail = '';
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
  const requested = String(outputArg || '').trim();
  const outputPath = requested
    ? path.resolve(PROJECT_ROOT, requested)
    : path.join(PROJECT_ROOT, DEFAULT_OUTPUT_DIR, `release-gate-${safeTimestamp(new Date(evidence.startedAt))}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return outputPath;
}

export async function runReleaseGate(argv = process.argv.slice(2), env = process.env) {
  const args = parseReleaseGateArgs(argv);
  const dryRun = boolArg(args['dry-run']);
  const plan = buildReleaseGatePlan(args, env);
  const checkout = dryRun
    ? {
        commit: gitValue(['rev-parse', 'HEAD']),
        branch: gitValue(['branch', '--show-current']),
        dirty: null,
      }
    : assertCleanCheckout({ allowDirty: boolArg(args['allow-dirty']) });
  const evidence = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    posture: 'running',
    dryRun,
    application: {
      commit: checkout.commit,
      branch: checkout.branch,
      dirtyCheckout: checkout.dirty,
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    release: {
      baseUrl: plan.baseUrl,
      databaseChecksSkipped: plan.skipDatabase,
      smokeSkipped: plan.skipSmoke,
      codeChecksSkipped: plan.skipCode,
    },
    steps: [],
  };

  for (const step of plan.steps) {
    console.log(`\n==> ${step.id}`);
    const result = await runStep(step, { dryRun });
    evidence.steps.push(result);
    if (result.status === 'failed') break;
  }
  evidence.completedAt = new Date().toISOString();
  evidence.posture = evidence.steps.some((step) => step.status === 'failed')
    ? 'block'
    : dryRun
      ? 'dry-run'
      : 'pass';
  const outputPath = writeEvidence(evidence, args.output);
  console.log(`\nRelease evidence: ${outputPath}`);
  console.log(`Posture: ${evidence.posture}`);
  return { evidence, outputPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = await runReleaseGate();
    if (result.evidence.posture === 'block') process.exitCode = 1;
  } catch (error) {
    console.error(`Release gate blocked: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
