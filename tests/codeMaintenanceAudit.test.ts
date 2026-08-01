import assert from 'node:assert/strict';
import test from 'node:test';
import { runMaintenanceAudit } from '../scripts/code-maintenance-audit.mjs';

test('code maintenance audit passes structural and database ownership checks', async () => {
  const result = await runMaintenanceAudit();
  const failed = result.checks.filter((check) => !check.ok);
  assert.equal(result.posture, 'pass', JSON.stringify(failed, null, 2));
  assert.equal(result.summary.criticalFailed, 0);
  const firestoreCheck = result.checks.find((check) => check.id === 'no-legacy-firestore-adapter');
  assert.ok(firestoreCheck, 'legacy Firestore regression check must exist');
  assert.equal(firestoreCheck.ok, true, firestoreCheck.detail);
});
