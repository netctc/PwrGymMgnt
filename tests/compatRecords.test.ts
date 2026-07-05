import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPAT_RECORDS_DEFAULT_LIMIT,
  COMPAT_RECORDS_MAX_LIMIT,
  compatibilityRecordsDeprecationHeaders,
  isCompatibilityRecordsApiEnabled,
  parseCompatibilityRecordsPagination,
} from '../server/compatRecords';

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
