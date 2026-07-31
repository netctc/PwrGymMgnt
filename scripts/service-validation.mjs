#!/usr/bin/env node
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseServiceValidationArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    windows: false,
    linux: false,
    baseUrl: String(env.DEPLOY_BASE_URL || '').trim(),
    json: false,
    output: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '-w') args.windows = true;
    else if (token === '-l') args.linux = true;
    else if (token === '--json') args.json = true;
    else if (token.startsWith('--')) {
      const [name, inlineValue] = token.slice(2).split('=', 2);
      const value = inlineValue ?? argv[index + 1];
      if (inlineValue === undefined) index += 1;
      if (name === 'base-url') args.baseUrl = String(value || '').trim();
      else if (name === 'output') args.output = String(value || '');
      else throw new Error(`Unknown option: --${name}`);
    } else throw new Error(`Unknown option: ${token}`);
  }
  if (args.windows === args.linux) {
    throw new Error('Select exactly one host: -w for Windows or -l for Linux.');
  }
  if (!args.baseUrl) throw new Error('--base-url or DEPLOY_BASE_URL is required.');
  const url = new URL(args.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Service validation URL must use http:// or https://.');
  }
  if (url.username || url.password) {
    throw new Error('Service validation URL must not contain credentials.');
  }
  args.baseUrl = url.toString().replace(/\/+$/, '');
  return args;
}

export function buildServiceChecks(args) {
  return args.windows
    ? [
        { id: 'powergym-task', command: 'schtasks.exe', args: ['/Query', '/TN', 'PowerGym'] },
        { id: 'health-task', command: 'schtasks.exe', args: ['/Query', '/TN', 'PowerGym-Health'] },
      ]
    : [
        { id: 'powergym-enabled', command: 'systemctl', args: ['is-enabled', 'powergym.service'] },
        { id: 'powergym-active', command: 'systemctl', args: ['is-active', 'powergym.service'] },
        { id: 'health-timer-enabled', command: 'systemctl', args: ['is-enabled', 'powergym-health.timer'] },
        { id: 'health-timer-active', command: 'systemctl', args: ['is-active', 'powergym-health.timer'] },
      ];
}

export function summarizeServiceResults(results) {
  const failed = results.filter((result) => result.status !== 'passed').length;
  return {
    posture: failed ? 'block' : 'pass',
    total: results.length,
    passed: results.length - failed,
    failed,
  };
}

function runCommand(check) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(check.command, check.args, {
      cwd: PROJECT_ROOT,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4096);
    });
    child.once('error', (error) => {
      resolve({
        id: check.id,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        reason: error.message,
      });
    });
    child.once('close', (code) => {
      resolve({
        id: check.id,
        status: code === 0 ? 'passed' : 'failed',
        durationMs: Date.now() - startedAt,
        exitCode: code,
        ...(code === 0 ? {} : { reason: stderr.trim() || `Exit code ${code}` }),
      });
    });
  });
}

async function checkHealth(baseUrl) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    return {
      id: 'application-health',
      status: response.status === 200 ? 'passed' : 'failed',
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      ...(response.status === 200 ? {} : { reason: `Expected HTTP 200, received ${response.status}` }),
    };
  } catch (error) {
    return {
      id: 'application-health',
      status: 'failed',
      durationMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
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
        `service-validation-${evidence.host}-${safeTimestamp(new Date(evidence.startedAt))}.json`,
      );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return outputPath;
}

export async function runServiceValidation(argv = process.argv.slice(2)) {
  const args = parseServiceValidationArgs(argv);
  const expectedPlatform = args.windows ? 'win32' : 'linux';
  if (process.platform !== expectedPlatform) {
    throw new Error(`Selected ${args.windows ? 'Windows' : 'Linux'} but this host is ${process.platform}.`);
  }
  const evidence = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    host: args.windows ? 'windows' : 'linux',
    platform: process.platform,
    baseUrl: args.baseUrl,
    results: [],
    summary: null,
  };
  for (const check of buildServiceChecks(args)) {
    evidence.results.push(await runCommand(check));
  }
  evidence.results.push(await checkHealth(args.baseUrl));
  evidence.summary = summarizeServiceResults(evidence.results);
  evidence.completedAt = new Date().toISOString();
  const outputPath = writeEvidence(evidence, args.output);
  if (args.json) console.log(JSON.stringify(evidence, null, 2));
  else {
    console.log('PowerGym service validation');
    console.log('---------------------------');
    for (const result of evidence.results) {
      console.log(`[${result.status.toUpperCase()}] ${result.id}${result.reason ? `: ${result.reason}` : ''}`);
    }
    console.log(`Evidence: ${outputPath}`);
    console.log(`Posture: ${evidence.summary.posture}`);
  }
  return { evidence, outputPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runServiceValidation()
    .then(({ evidence }) => {
      if (evidence.summary.posture !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`Service validation failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
