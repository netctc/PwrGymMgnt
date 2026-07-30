#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from './load-env.mjs';

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
loadDotEnv(path.join(projectDirectory, '.env'));

const baseUrl = String(
  process.env.DEPLOY_BASE_URL
    || process.env.API_PUBLIC_BASE_URL
    || process.env.PUBLIC_APP_ORIGIN
    || '',
).replace(/\/+$/, '');
const alertWebhook = String(process.env.INSTALL_ALERT_WEBHOOK_URL || '').trim();
const timeoutMs = Number(process.env.INSTALL_MONITOR_TIMEOUT_MS || 8000);

if (!baseUrl) {
  console.error('Installation monitor: no public base URL is configured.');
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);
let failure = '';

try {
  const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
  if (!response.ok) failure = `Health endpoint returned HTTP ${response.status}`;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  clearTimeout(timeout);
}

if (!failure) {
  console.log(JSON.stringify({ status: 'healthy', baseUrl, checkedAt: new Date().toISOString() }));
  process.exit(0);
}

const alert = {
  service: 'PowerGym',
  status: 'unhealthy',
  baseUrl,
  error: failure,
  checkedAt: new Date().toISOString(),
};
console.error(JSON.stringify(alert));

if (alertWebhook) {
  try {
    await fetch(alertWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alert),
    });
  } catch (error) {
    console.error(`Installation alert webhook failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exit(1);
