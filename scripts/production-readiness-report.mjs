import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getOperationalConfig, parseCliArgs, validateProductionConfig } from './deploy-utils.mjs';

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

function countFiles(dir, predicate = () => true) {
  const full = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(full)) return 0;
  return fs.readdirSync(full).filter(predicate).length;
}

export function buildProductionReadinessEvidence({ now = new Date(), env = process.env } = {}) {
  const packageJson = readJson(path.resolve(process.cwd(), 'package.json'), {});
  const preflight = validateProductionConfig(getOperationalConfig(env));
  const openApi = readJson(path.resolve(process.cwd(), 'docs/openapi.json'), {});
  const scripts = packageJson.scripts || {};
  const evidenceChecks = [
    { id: 'openapi-export-script', ok: Boolean(scripts['api:export']), message: 'OpenAPI export script is registered.' },
    { id: 'production-readiness-script', ok: Boolean(scripts['ops:production-readiness']), message: 'Production readiness evidence script is registered.' },
    { id: 'deployment-runbook', ok: fileExists('docs/DEPLOYMENT_RUNBOOK.md'), message: 'Deployment runbook is available.' },
    { id: 'production-checklist', ok: fileExists('docs/PRODUCTION_OPERATION_CHECKLIST.md'), message: 'Production operation checklist is available.' },
    { id: 'openapi-artifact', ok: fileExists('docs/openapi.json'), message: 'OpenAPI JSON artifact is available.' },
    { id: 'migration-inventory', ok: countFiles('sql', (name) => /^\d+_.*\.sql$/.test(name)) >= 10, message: 'SQL migration inventory is present.' },
  ];

  const failedEvidenceChecks = evidenceChecks.filter((check) => !check.ok).length;
  const posture = preflight.summary.posture === 'block' || failedEvidenceChecks > 0 ? 'block' : preflight.summary.posture;

  return {
    generatedAt: now.toISOString(),
    application: {
      name: packageJson.name || 'powergym',
      version: packageJson.version || '0.0.0',
      node: process.version,
      environment: env.NODE_ENV || 'development',
    },
    posture,
    preflight: preflight.summary,
    evidence: {
      checks: evidenceChecks,
      failed: failedEvidenceChecks,
      openApiPaths: openApi?.paths ? Object.keys(openApi.paths).length : 0,
      migrationFiles: countFiles('sql', (name) => /^\d+_.*\.sql$/.test(name)),
      documentationFiles: countFiles('docs', (name) => name.endsWith('.md')),
    },
    recommendedReleaseCommand: 'npm run ops:release-readiness',
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  const args = parseCliArgs();
  const output = path.resolve(process.cwd(), String(args.output || args.o || 'docs/production-readiness-evidence.json'));
  const report = buildProductionReadinessEvidence();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ generatedAt: report.generatedAt, posture: report.posture, output, evidenceFailed: report.evidence.failed }, null, 2));
  if (args.strict && report.posture === 'block') process.exit(2);
}
