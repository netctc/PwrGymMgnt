import './load-env.mjs';
import process from 'node:process';
import { getOperationalConfig, parseCliArgs, validateProductionConfig } from './deploy-utils.mjs';

const args = parseCliArgs();
const jsonMode = Boolean(args.json);
const strict = args.strict !== false && args.strict !== 'false';
const result = validateProductionConfig(getOperationalConfig());

if (jsonMode) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));
} else {
  console.log('PowerGym deployment preflight');
  console.log('-----------------------------');
  console.log(`Posture: ${result.summary.posture}`);
  console.log(`Checks: ${result.summary.total} | Failed: ${result.summary.failed} | Critical: ${result.summary.criticalFailed} | Warnings: ${result.summary.warningFailed}`);
  console.log('');
  for (const check of result.checks) {
    const marker = check.ok ? 'PASS' : check.severity.toUpperCase();
    console.log(`[${marker}] ${check.id}: ${check.message}`);
    if (!check.ok && check.recommendation) console.log(`  Recommendation: ${check.recommendation}`);
  }
}

if (strict && result.summary.criticalFailed > 0) {
  process.exit(2);
}
if (strict && result.summary.warningFailed > 0 && args.failOnWarnings) {
  process.exit(1);
}
