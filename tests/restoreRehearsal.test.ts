import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRestoreRehearsalPlan,
  getRehearsalDatabaseEnv,
} from '../scripts/db-restore-rehearsal.mjs';

const productionDb = {
  host: 'localhost',
  port: 3306,
  user: 'powergym',
  password: 'production-secret',
  database: 'powergym',
};

function rehearsalEnv(overrides: Record<string, string> = {}) {
  return {
    REHEARSAL_DATABASE_HOSTNAME: 'localhost',
    REHEARSAL_DATABASE_PORT: '3306',
    REHEARSAL_DATABASE_USER_NAME: 'powergym_rehearsal',
    REHEARSAL_DATABASE_PASSWORD: 'rehearsal-secret',
    REHEARSAL_DATABASE_NAME: 'powergym_restore_test',
    npm_execpath: '/npm/npm-cli.js',
    ...overrides,
  };
}

test('rehearsal database configuration only reads dedicated variables', () => {
  const config = getRehearsalDatabaseEnv({
    DATABASE_NAME: 'production',
    DATABASE_PASSWORD: 'production-secret',
    ...rehearsalEnv(),
  });
  assert.equal(config.database, 'powergym_restore_test');
  assert.equal(config.password, 'rehearsal-secret');
});

test('restore rehearsal blocks the application database and unsafe names', () => {
  const sameTarget = buildRestoreRehearsalPlan({
    args: { backup: 'powergym_release.sql', confirm: 'RESTORE_REHEARSAL' },
    env: rehearsalEnv({ REHEARSAL_DATABASE_NAME: 'powergym' }),
    productionDb,
  });
  assert.equal(sameTarget.canRun, false);
  assert.ok(sameTarget.blockers.some((item) => item.includes('must differ')));
  assert.ok(sameTarget.blockers.some((item) => item.includes('must contain')));
});

test('restore rehearsal requires explicit confirmation outside dry-run', () => {
  const plan = buildRestoreRehearsalPlan({
    args: { backup: 'powergym_release.sql' },
    env: rehearsalEnv(),
    productionDb,
  });
  assert.equal(plan.canRun, false);
  assert.ok(plan.blockers.some((item) => item.includes('--confirm=RESTORE_REHEARSAL')));
});

test('valid restore rehearsal uses isolated credentials and ordered verification', () => {
  const plan = buildRestoreRehearsalPlan({
    args: { backup: 'powergym_release.sql', confirm: 'RESTORE_REHEARSAL' },
    env: rehearsalEnv(),
    productionDb,
  });
  assert.equal(plan.canRun, true);
  assert.deepEqual(plan.steps.map((step) => step.id), [
    'inspect-backup',
    'restore-isolated-database',
    'verify-restored-database',
    'verify-restored-integrity',
  ]);
  assert.equal(plan.childEnv.DATABASE_NAME, 'powergym_restore_test');
  assert.equal(plan.childEnv.NODE_ENV, 'test');
  assert.equal(plan.childEnv.DATABASE_RESTORE_ALLOW_PRODUCTION, 'false');
  assert.equal(JSON.stringify(plan.target).includes('rehearsal-secret'), false);
});

test('dry-run validates a complete plan without destructive confirmation', () => {
  const plan = buildRestoreRehearsalPlan({
    args: { backup: 'powergym_release.sql', 'dry-run': true },
    env: rehearsalEnv(),
    productionDb,
  });
  assert.equal(plan.canRun, true);
  assert.equal(plan.dryRun, true);
});
