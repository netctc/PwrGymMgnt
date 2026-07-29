import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPublicUrl,
  parseInstallerArgs,
  updateEnvText,
} from '../scripts/install-online.mjs';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('Pre-Online navigation removes biometric and access-control menu items', () => {
  const layout = read('src/components/Layout.tsx');
  assert.doesNotMatch(layout, /labelKey:\s*['"]nav\.biometrics/);
  assert.doesNotMatch(layout, /labelKey:\s*['"]nav\.accessControl/);
  assert.match(layout, /labelKey:\s*['"]nav\.evolution['"]/);
});

test('Dashboard exposes Evolution and active employee destinations', () => {
  const dashboard = read('src/pages/Dashboard.tsx');
  assert.match(dashboard, /to="\/evolution"/);
  assert.match(dashboard, /Dashboard Evolution/);
  assert.match(dashboard, /to="\/hr\?tab=employees&status=active"/);
  assert.match(dashboard, /Total Employees/);
  assert.doesNotMatch(dashboard, />\s*Occupancy Rate\s*</);
});

test('Dashboard contract and backend expose total active employees', () => {
  assert.match(read('shared/apiContracts.ts'), /totalEmployees:\s*z\.number\(\)\.int\(\)\.nonnegative\(\)/);
  const backend = read('server/dashboard.ts');
  assert.match(backend, /loadActiveEmployeeCount/);
  assert.match(backend, /employment_status/);
  assert.match(backend, /totalEmployees,/);
});

test('Installer selects one platform and constructs domain or IP URLs', () => {
  assert.equal(parseInstallerArgs(['-w', '--domain', 'gym.example']).windows, true);
  assert.equal(parseInstallerArgs(['-l', '--ip', '10.0.0.8']).linux, true);
  assert.throws(() => parseInstallerArgs(['-w', '-l']), /exactly one/);
  assert.equal(buildPublicUrl({ domain: 'gym.example' }), 'https://gym.example');
  assert.equal(buildPublicUrl({ ip: '10.0.0.8', port: '3000' }), 'http://10.0.0.8:3000');
});

test('Installer environment updates are idempotent and portable', () => {
  const first = updateEnvText('NODE_ENV=development\nPORT=3000\n', {
    NODE_ENV: 'production',
    PORT: '8080',
    API_PUBLIC_BASE_URL: 'https://gym.example',
  });
  const second = updateEnvText(first, {
    NODE_ENV: 'production',
    PORT: '8080',
    API_PUBLIC_BASE_URL: 'https://gym.example',
  });
  assert.equal(second, first);
  assert.match(first, /^NODE_ENV=production$/m);
  assert.match(first, /^API_PUBLIC_BASE_URL=https:\/\/gym\.example$/m);
});

test('Required administrator accounts use the requested identifiers', () => {
  const initializer = read('scripts/db-init-users.mjs');
  assert.match(initializer, /admin@powergym\.local/);
  assert.match(initializer, /super_admin@powergym\.local/);
  assert.match(initializer, /Ab\.654321/);
  assert.doesNotMatch(initializer, /superadmin@powergym\.local/);
});

test('Production server URLs are configurable instead of localhost-bound', () => {
  const server = read('server.ts');
  assert.match(server, /API_PUBLIC_BASE_URL/);
  assert.doesNotMatch(server, /url:\s*`http:\/\/localhost/);
  assert.match(server, /app\.listen\(PORT,\s*"0\.0\.0\.0"/);
});
