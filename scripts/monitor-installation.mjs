#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from './load-env.mjs';

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
loadDotEnv(path.join(projectDirectory, '.env'));

const monitorLogPath = path.join(projectDirectory, 'logs', 'monitor.log');

async function appendMonitorLog(entry) {
  await fs.mkdir(path.dirname(monitorLogPath), { recursive: true });
  await fs.appendFile(monitorLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

const baseUrl = String(
  process.env.DEPLOY_BASE_URL
    || process.env.API_PUBLIC_BASE_URL
    || process.env.PUBLIC_APP_ORIGIN
    || '',
).replace(/\/+$/, '');
const alertWebhook = String(process.env.INSTALL_ALERT_WEBHOOK_URL || '').trim();
const timeoutMs = Number(process.env.INSTALL_MONITOR_TIMEOUT_MS || 8000);

if (!baseUrl) {
  await appendMonitorLog({
    status: 'configuration-error',
    error: 'No public base URL is configured.',
    checkedAt: new Date().toISOString(),
  });
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
await appendMonitorLog(alert);

if (alertWebhook) {
  try {
    await fetch(alertWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alert),
    });
  } catch (error) {
    const webhookError = error instanceof Error ? error.message : String(error);
    console.error(`Installation alert webhook failed: ${webhookError}`);
    await appendMonitorLog({
      service: 'PowerGym',
      status: 'alert-delivery-failed',
      error: webhookError,
      checkedAt: new Date().toISOString(),
    });
  }
}
process.exit(1);
