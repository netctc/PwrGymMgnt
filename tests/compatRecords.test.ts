import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMPAT_RECORDS_DEFAULT_LIMIT,
  COMPAT_RECORDS_MAX_LIMIT,
  compatibilityRecordsDeprecationHeaders,
  isCompatibilityRecordsApiEnabled,
  parseCompatibilityRecordsPagination,
} from '../server/compatRecords';
import { normalizeGeneralSettingsPatch } from '../server/generalSettings';

const projectRoot = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(projectRoot, file), 'utf8');

test('compat records API is disabled by default only in production', () => {
  assert.equal(isCompatibilityRecordsApiEnabled({ NODE_ENV: 'development' } as any), true);
  assert.equal(isCompatibilityRecordsApiEnabled({ NODE_ENV: 'test' } as any), true);
  assert.equal(isCompatibilityRecordsApiEnabled({ NODE_ENV: 'production' } as any), false);
  assert.equal(isCompatibilityRecordsApiEnabled({ NODE_ENV: 'production', ENABLE_COMPAT_RECORDS_API: 'true' } as any), true);
  assert.equal(isCompatibilityRecordsApiEnabled({ NODE_ENV: 'development', DISABLE_COMPAT_RECORDS_API: 'true' } as any), false);
});

test('compat records pagination applies safe defaults and max limits', () => {
  assert.deepEqual(parseCompatibilityRecordsPagination({}), { limit: COMPAT_RECORDS_DEFAULT_LIMIT, offset: 0 });
  assert.deepEqual(parseCompatibilityRecordsPagination({ limit: '10000', offset: '20' }), { limit: COMPAT_RECORDS_MAX_LIMIT, offset: 20 });
  assert.deepEqual(parseCompatibilityRecordsPagination({ limit: '25', page: '3' }), { limit: 25, offset: 50 });
  assert.deepEqual(parseCompatibilityRecordsPagination({ limit: '-10', offset: '-20' }), { limit: COMPAT_RECORDS_DEFAULT_LIMIT, offset: 0 });
});

test('compat records deprecation headers are explicit', () => {
  const headers = compatibilityRecordsDeprecationHeaders();
  assert.equal(headers.Deprecation, 'true');
  assert.equal(headers['X-Compatibility-Api'], 'deprecated');
  assert.match(headers.Warning, /Deprecated compatibility records API/);
});


test('typed general settings API replaces the disabled compatibility records route', () => {
  const routes = read('server/generalSettings.ts');
  const modules = read('server/modules.ts');
  const page = read('src/pages/Settings.tsx');
  const context = read('src/contexts/SettingsContext.tsx');

  assert.match(routes, /app\.get\("\/api\/settings\/general"/);
  assert.match(routes, /app\.put\("\/api\/settings\/general"/);
  assert.match(routes, /requirePermission\("records\.settings\.read"\)/);
  assert.match(routes, /requirePermission\("records\.settings\.write"\)/);
  assert.match(routes, /JSON_MERGE_PATCH/);
  assert.match(modules, /registerGeneralSettingsRoutes/);
  assert.match(page, /saveGeneralSettings/);
  assert.match(context, /fetchGeneralSettings/);
  assert.doesNotMatch(page, /firebase\/firestore|\/api\/records\/settings/);
  assert.doesNotMatch(context, /firebase\/firestore|\/api\/records\/settings/);
});

test('general settings validation normalizes supported fields and rejects unsafe payloads', () => {
  assert.deepEqual(normalizeGeneralSettingsPatch({
    gymName: '  PowerGym Beirut  ',
    staffRoles: [' admin ', 'admin', 'manager'],
  }), {
    gymName: 'PowerGym Beirut',
    staffRoles: ['admin', 'manager'],
  });
  assert.throws(() => normalizeGeneralSettingsPatch({ unknown: true }), /No supported settings fields/);
  assert.throws(() => normalizeGeneralSettingsPatch({ rooms: 'Sala A' }), /rooms must be an array/);
  assert.throws(() => normalizeGeneralSettingsPatch({ ecardNote: 'x'.repeat(1001) }), /maximum length/);
});
