import assert from 'node:assert/strict';
import test from 'node:test';
import { daysBetweenInclusive, validateDateRange } from '../src/lib/dateRange';

test('date range validation accepts same day and inclusive ranges', () => {
  assert.equal(daysBetweenInclusive('2026-06-08', '2026-06-08'), 1);
  assert.deepEqual(validateDateRange('2026-06-01', '2026-06-08', { maxDays: 30 }), {
    valid: true,
    days: 8,
  });
});

test('date range validation rejects reversed dates', () => {
  const result = validateDateRange('2026-06-09', '2026-06-08');
  assert.equal(result.valid, false);
  assert.match(result.message || '', /From date/);
});

test('date range validation enforces maximum day windows', () => {
  const result = validateDateRange('2026-01-01', '2027-01-02', { maxDays: 366 });
  assert.equal(result.valid, false);
  assert.match(result.message || '', /cannot exceed 366/);
});

test('date range validation rejects malformed input unless empty is allowed', () => {
  assert.equal(validateDateRange('not-a-date', '2026-06-08').valid, false);
  assert.equal(validateDateRange('', '', { allowEmpty: true }).valid, true);
});
