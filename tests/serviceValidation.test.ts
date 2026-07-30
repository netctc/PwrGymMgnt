import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildServiceChecks,
  parseServiceValidationArgs,
  summarizeServiceResults,
} from '../scripts/service-validation.mjs';

test('service validation requires exactly one operating system', () => {
  assert.throws(() => parseServiceValidationArgs([], {}), /exactly one host/);
  assert.throws(
    () => parseServiceValidationArgs(['-w', '-l', '--base-url=http://localhost:3000'], {}),
    /exactly one host/,
  );
});

test('Windows checks use the two installed scheduled task names', () => {
  const checks = buildServiceChecks({ windows: true });
  assert.deepEqual(checks.map((check) => check.id), ['powergym-task', 'health-task']);
  assert.ok(checks.every((check) => check.command === 'schtasks.exe'));
});

test('Linux checks validate service and health timer state', () => {
  const checks = buildServiceChecks({ windows: false });
  assert.equal(checks.length, 4);
  assert.ok(checks.every((check) => check.args.includes('--user')));
  assert.ok(checks.some((check) => check.args.includes('powergym-health.timer')));
});

test('service validation rejects credentials in URLs and summarizes failures', () => {
  assert.throws(
    () => parseServiceValidationArgs(['-w', '--base-url=http://user:pass@localhost:3000'], {}),
    /must not contain credentials/,
  );
  assert.equal(
    summarizeServiceResults([{ status: 'passed' }, { status: 'failed' }]).posture,
    'block',
  );
});
