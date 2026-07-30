import './load-env.mjs';
import process from 'node:process';
import { buildSmokeChecks, normalizeBaseUrl, parseCliArgs, redactHeaders, summarizeSmokeResults } from './deploy-utils.mjs';
import { prepareSmokeAuthentication } from './smoke-auth.mjs';

const args = parseCliArgs();
const baseUrl = normalizeBaseUrl(String(args['base-url'] || process.env.DEPLOY_BASE_URL || process.env.PASSWORD_RESET_PUBLIC_BASE_URL || ''));
const includeDb = Boolean(args['include-db']);
const includeReadiness = Boolean(args['include-readiness']);
const jsonMode = Boolean(args.json);
const timeoutMs = Number(args.timeout || process.env.DEPLOY_SMOKE_TIMEOUT_MS || 8000);
const authentication = await prepareSmokeAuthentication({
  baseUrl,
  includeDb,
  token: args.token || process.env.DEPLOY_SMOKE_AUTH_TOKEN || '',
  email: process.env.DEPLOY_SMOKE_LOGIN_EMAIL || '',
  password: process.env.DEPLOY_SMOKE_LOGIN_PASSWORD || '',
});
const headers = authentication.headers;

async function checkEndpoint(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(check.url, { headers, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 300); }
    return {
      ...check,
      status: response.status,
      durationMs: Date.now() - started,
      ok: check.expectedStatuses.includes(response.status),
      body,
    };
  } catch (error) {
    const cause = error instanceof Error && error.cause && typeof error.cause === 'object'
      ? error.cause
      : null;
    return {
      ...check,
      status: 0,
      durationMs: Date.now() - started,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: cause && 'code' in cause ? String(cause.code || '') : '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

const checks = buildSmokeChecks({ baseUrl, includeDb, includeReadiness });
const results = [];
for (const check of checks) {
  results.push(await checkEndpoint(check));
}
const summary = summarizeSmokeResults(results);
const authenticationEvidence = {
  ok: authentication.ok,
  mode: authentication.mode,
  status: authentication.status || null,
  error: authentication.error || '',
};

if (jsonMode) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    headers: redactHeaders(headers),
    authentication: authenticationEvidence,
    summary,
    results,
  }, null, 2));
} else {
  console.log('PowerGym post-deploy smoke tests');
  console.log('--------------------------------');
  console.log(`Base URL: ${baseUrl}`);
  if (includeDb) {
    const marker = authentication.ok ? 'PASS' : 'WARN';
    console.log(`[${marker}] authentication (${authentication.mode}): ${authentication.message || authentication.error}`);
  }
  for (const result of results) {
    const marker = result.ok ? 'PASS' : result.required === false ? 'WARN' : 'FAIL';
    console.log(`[${marker}] ${result.id}: HTTP ${result.status} in ${result.durationMs}ms`);
    if (result.error) console.log(`  Error: ${result.error}${result.errorCode ? ` (${result.errorCode})` : ''}`);
  }
  console.log(`Posture: ${summary.posture}`);
}

process.exit(summary.failed > 0 ? 1 : 0);
