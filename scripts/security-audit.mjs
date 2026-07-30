#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveNpmInvocation } from './release-gate.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REACT_ROUTER_ADVISORY = 'GHSA-qwww-vcr4-c8h2';
const PATCHED_REACT_ROUTER_7 = [7, 18, 2];
const RSC_PATTERNS = [
  /\bunstable_RSC\w*/g,
  /\bRSCStaticRouter\b/g,
  /\brouteRSCServerRequest\b/g,
  /\bcreateCallServer\b/g,
];

function versionTuple(version) {
  return String(version || '')
    .replace(/^v/, '')
    .split(/[.-]/, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersion(left, right) {
  const a = versionTuple(left);
  const b = Array.isArray(right) ? right : versionTuple(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

export function isPatchedReactRouter7(version) {
  const major = versionTuple(version)[0];
  return major === 7 && compareVersion(version, PATCHED_REACT_ROUTER_7) >= 0;
}

function packageVersion(lock, packageName) {
  return lock?.packages?.[`node_modules/${packageName}`]?.version || '';
}

function advisoryIds(vulnerability) {
  return (vulnerability?.via || [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => String(item.url || item.name || ''))
    .filter(Boolean);
}

/**
 * Evaluate npm's JSON audit report while enforcing the reviewed React Router
 * advisory conditions.
 *
 * @param {any} report
 * @param {{ lock?: any, rscUsage?: string[] }} [options]
 */
export function evaluateSecurityAudit(report, { lock, rscUsage = [] } = {}) {
  const vulnerabilities = report?.vulnerabilities || {};
  const routerVersion = packageVersion(lock, 'react-router');
  const routerDomVersion = packageVersion(lock, 'react-router-dom');
  const router = vulnerabilities['react-router'];
  const routerDom = vulnerabilities['react-router-dom'];
  const routerOnlyKnownAdvisory = router
    && advisoryIds(router).length > 0
    && advisoryIds(router).every((id) => id.includes(REACT_ROUTER_ADVISORY));
  const patchedVersions = isPatchedReactRouter7(routerVersion) && isPatchedReactRouter7(routerDomVersion);
  const canAcceptRouterAdvisory = Boolean(routerOnlyKnownAdvisory && patchedVersions && rscUsage.length === 0);
  const accepted = [];
  const blocking = [];

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    const isRouterFinding = name === 'react-router'
      || (name === 'react-router-dom'
        && (vulnerability?.via || []).every((item) => item === 'react-router'));
    if (isRouterFinding && canAcceptRouterAdvisory) {
      accepted.push({
        name,
        severity: vulnerability.severity,
        advisory: REACT_ROUTER_ADVISORY,
        installedVersion: name === 'react-router' ? routerVersion : routerDomVersion,
        reason: 'Maintainer-patched React Router 7.18.2+ is installed and no unstable RSC APIs are used.',
      });
    } else {
      blocking.push({ name, severity: vulnerability.severity, via: vulnerability.via });
    }
  }

  return {
    posture: blocking.length > 0 ? 'block' : accepted.length > 0 ? 'pass-with-reviewed-exception' : 'pass',
    installed: { reactRouter: routerVersion, reactRouterDom: routerDomVersion },
    rscUsage,
    accepted,
    blocking,
  };
}

function scanRscUsage(root = PROJECT_ROOT) {
  const matches = [];
  const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage', 'release-evidence', 'docs']);
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (/\.(?:[cm]?[jt]sx?)$/i.test(entry.name)) {
        const text = fs.readFileSync(absolute, 'utf8');
        for (const pattern of RSC_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            matches.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
            break;
          }
        }
      }
    }
  };
  walk(root);
  return matches.sort();
}

export function runSecurityAudit() {
  const lock = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package-lock.json'), 'utf8'));
  const invocation = resolveNpmInvocation();
  const audit = spawnSync(
    invocation.command,
    [...invocation.prefixArgs, 'audit', '--json'],
    { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env: process.env },
  );
  if (audit.error) throw audit.error;
  let report;
  try {
    report = JSON.parse(String(audit.stdout || '').trim());
  } catch {
    throw new Error(`npm audit did not return valid JSON: ${String(audit.stderr || '').trim()}`);
  }
  return evaluateSecurityAudit(report, { lock, rscUsage: scanRscUsage() });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = runSecurityAudit();
    console.log(JSON.stringify(result, null, 2));
    if (result.posture === 'block') process.exitCode = 1;
  } catch (error) {
    console.error(`Security audit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
