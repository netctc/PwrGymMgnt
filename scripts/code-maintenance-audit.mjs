#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_MODE = process.argv.includes('--json');

async function read(relativePath) {
  return fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function duplicateEnvKeys(text) {
  const counts = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

async function transientSourceFiles() {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'backups', 'coverage']);
  const matches = [];
  const walk = async (directory) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (/\.(?:bak|backup|tmp)$|~$/i.test(entry.name)) {
        matches.push(path.relative(PROJECT_ROOT, absolute).replaceAll(path.sep, '/'));
      }
    }
  };
  await walk(PROJECT_ROOT);
  return matches.sort();
}

function nodeMajor(range) {
  return Number(String(range || '').match(/\d+/)?.[0] || 0);
}

export async function runMaintenanceAudit() {
  const [packageText, dockerfile, renderYaml, envExample, server, initializer, installer, masterSchema, readme] =
    await Promise.all([
      read('package.json'),
      read('Dockerfile'),
      read('render.yaml'),
      read('.env.example'),
      read('server.ts'),
      read('scripts/db-init-users.mjs'),
      read('scripts/install-online.mjs'),
      read('sql/000_master_schema.sql'),
      read('README.md'),
    ]);
  const packageJson = JSON.parse(packageText);
  const expectedNodeMajor = nodeMajor(packageJson.engines?.node);
  const dockerNodeMajor = Number(dockerfile.match(/FROM node:(\d+)/)?.[1] || 0);
  const renderNodeMajor = Number(renderYaml.match(/NODE_VERSION[\s\S]*?value:\s*(\d+)/)?.[1] || 0);
  const sqlFiles = (await fs.readdir(path.join(PROJECT_ROOT, 'sql')))
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name))
    .sort();
  const duplicateMigrationPrefixes = Object.entries(
    sqlFiles.reduce((counts, name) => {
      const prefix = name.slice(0, 3);
      counts[prefix] = (counts[prefix] || 0) + 1;
      return counts;
    }, {}),
  ).filter(([, count]) => count > 1).map(([prefix]) => prefix);
  const transientFiles = await transientSourceFiles();

  const checks = [
    {
      id: 'node-version-alignment',
      severity: 'critical',
      ok: expectedNodeMajor === 22 && dockerNodeMajor === expectedNodeMajor && renderNodeMajor === expectedNodeMajor,
      detail: `package=${expectedNodeMajor || 'unknown'}, docker=${dockerNodeMajor || 'unknown'}, render=${renderNodeMajor || 'unknown'}`,
    },
    {
      id: 'readme-node-version',
      severity: 'warning',
      ok: /Node\.js 22\+/.test(readme),
      detail: 'README must match the package, Docker and Render Node.js requirement.',
    },
    {
      id: 'environment-key-uniqueness',
      severity: 'critical',
      ok: duplicateEnvKeys(envExample).length === 0,
      detail: duplicateEnvKeys(envExample).join(', ') || 'No duplicate keys.',
    },
    {
      id: 'migration-owned-schema',
      severity: 'critical',
      ok: !/CREATE TABLE IF NOT EXISTS/i.test(server)
        && !/CREATE TABLE IF NOT EXISTS/i.test(initializer),
      detail: 'Application and user initialization paths must not create canonical tables at runtime.',
    },
    {
      id: 'database-version-contract',
      severity: 'critical',
      ok: /MySQL 8\+/.test(masterSchema),
      detail: 'Schema documentation must match application use of MySQL 8 window functions.',
    },
    {
      id: 'migration-prefix-uniqueness',
      severity: 'critical',
      ok: duplicateMigrationPrefixes.length === 0,
      detail: duplicateMigrationPrefixes.join(', ') || `${sqlFiles.length} ordered root migration files.`,
    },
    {
      id: 'portable-clean-command',
      severity: 'warning',
      ok: packageJson.scripts?.clean === 'node scripts/clean-build.mjs',
      detail: String(packageJson.scripts?.clean || 'missing'),
    },
    {
      id: 'least-privilege-installer',
      severity: 'critical',
      ok: /installService:\s*false/.test(installer)
        && !/\/RU['"]?,\s*['"]SYSTEM/i.test(installer)
        && !/User=\$\{args\.serviceUser \|\| 'root'\}/.test(installer),
      detail: 'Service creation must be explicit and must not default to root or SYSTEM.',
    },
    {
      id: 'transient-source-files',
      severity: 'warning',
      ok: transientFiles.length === 0,
      detail: transientFiles.join(', ') || 'No backup or temporary source files.',
    },
  ];
  const failed = checks.filter((check) => !check.ok);
  return {
    generatedAt: new Date().toISOString(),
    posture: failed.some((check) => check.severity === 'critical')
      ? 'block'
      : failed.length
        ? 'warning'
        : 'pass',
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      criticalFailed: failed.filter((check) => check.severity === 'critical').length,
    },
    checks,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await runMaintenanceAudit();
  if (JSON_MODE) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`PowerGym code maintenance audit: ${result.posture.toUpperCase()}`);
    for (const check of result.checks) {
      console.log(`${check.ok ? 'PASS' : 'FAIL'} [${check.severity}] ${check.id}: ${check.detail}`);
    }
  }
  if (result.summary.criticalFailed > 0) process.exitCode = 1;
}
