import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildServiceChecks,
  parseServiceValidationArgs,
  summarizeServiceResults,
} from '../scripts/service-validation.mjs';
import {
  buildPowerShellArgs,
  parseWindowsServiceArgs,
} from '../scripts/windows-service-tasks.mjs';
import {
  buildLinuxSystemdUnits,
  parseLinuxServiceArgs,
} from '../scripts/linux-service-units.mjs';
import {
  buildBootstrapSql,
  parseLinuxBootstrapArgs,
  updateBootstrapEnv,
} from '../scripts/bootstrap-linux-mysql.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  assert.ok(checks.every((check) => !check.args.includes('--user')));
  assert.ok(checks.some((check) => check.args.includes('powergym-health.timer')));
});

test('Linux system units run as a non-root account with portable quoted paths', () => {
  const units = buildLinuxSystemdUnits({
    projectDir: '/opt/PowerGym Management',
    nodePath: '/usr/bin/node',
    serviceUser: 'powergym',
    serviceGroup: 'powergym',
  });
  assert.match(units['powergym.service'], /User=powergym/);
  assert.match(units['powergym.service'], /Group=powergym/);
  assert.match(units['powergym.service'], /WorkingDirectory="\/opt\/PowerGym Management"/);
  assert.match(units['powergym.service'], /EnvironmentFile="\/opt\/PowerGym Management\/\.env"/);
  assert.match(units['powergym.service'], /After=network-online\.target mysql\.service/);
  assert.match(units['powergym.service'], /Restart=always/);
  assert.match(units['powergym.service'], /NoNewPrivileges=true/);
  assert.match(units['powergym-health.timer'], /OnUnitActiveSec=5min/);
  assert.deepEqual(parseLinuxServiceArgs(['--dry-run', '--service-user=powergym']).serviceUser, 'powergym');
  assert.throws(
    () => buildLinuxSystemdUnits({
      projectDir: '/opt/powergym',
      nodePath: '/usr/bin/node',
      serviceUser: 'root;rm',
      serviceGroup: 'root',
    }),
    /Unsafe Linux service user/,
  );
  const installerSource = fs.readFileSync(
    path.join(projectRoot, 'scripts/linux-service-units.mjs'),
    'utf8',
  );
  assert.match(installerSource, /useradd/);
  assert.match(installerSource, /\/usr\/sbin\/nologin/);
  assert.match(installerSource, /prepareRuntimePermissions/);
  assert.match(installerSource, /fs\.chown\(envPath, uid, gid\)/);
  assert.match(installerSource, /\['logs', 'backups', 'release-evidence'\]/);
});

test('Linux MySQL bootstrap is restricted, idempotent and does not expose credentials', () => {
  assert.deepEqual(parseLinuxBootstrapArgs([]), {
    database: 'pwrgymdb',
    user: 'pwrgymdb',
    dryRun: false,
  });
  assert.throws(
    () => parseLinuxBootstrapArgs(['--database=bad-name;drop']),
    /Unsafe MySQL database/,
  );
  const sql = buildBootstrapSql({
    database: 'pwrgymdb',
    user: 'pwrgymdb',
    password: "safe'password",
  });
  assert.match(sql, /CREATE DATABASE IF NOT EXISTS `pwrgymdb`/);
  assert.match(sql, /CREATE USER IF NOT EXISTS 'pwrgymdb'@'localhost'/);
  assert.match(sql, /GRANT ALL PRIVILEGES ON `pwrgymdb`\.\*/);
  assert.doesNotMatch(sql, /@'%'/);
  const env = updateBootstrapEnv('DATABASE_NAME=old\nDATABASE_PASSWORD=old\n', {
    DATABASE_NAME: 'pwrgymdb',
    DATABASE_PASSWORD: 'generated',
  });
  assert.match(env, /^DATABASE_NAME=pwrgymdb$/m);
  assert.match(env, /^DATABASE_PASSWORD=generated$/m);
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

test('scheduled task entry points resolve the project and environment from their script path', () => {
  for (const relativePath of [
    'scripts/service-runner.mjs',
    'scripts/monitor-installation.mjs',
  ]) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
    assert.match(source, /loadDotEnv\(path\.join\(projectDirectory, '\.env'\)\)/);
  }
});

test('service runner remains alive without a console and records restart diagnostics', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'scripts/service-runner.mjs'),
    'utf8',
  );
  assert.match(source, /logs/);
  assert.match(source, /service\.log/);
  assert.match(source, /stdio: \['ignore', logFile, logFile\]/);
  assert.match(source, /scheduleRestart/);
  assert.doesNotMatch(source, /\.unref\(\)/);
});

test('Windows service repair builds an unambiguous PowerShell invocation', () => {
  const projectDirectory = 'C:\\PowerGym Management';
  const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
  const args = buildPowerShellArgs({ projectDir: projectDirectory, nodePath });
  assert.deepEqual(args.slice(0, 4), [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
  ]);
  assert.equal(args[args.indexOf('-ProjectDirectory') + 1], projectDirectory);
  assert.equal(args[args.indexOf('-NodePath') + 1], nodePath);
  assert.ok(args.includes('-StartService'));
  assert.deepEqual(parseWindowsServiceArgs(['--dry-run', '--no-start']), {
    dryRun: true,
    start: false,
  });
});

test('PowerShell task registration sets executable and working directory separately', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'scripts/register-windows-tasks.ps1'),
    'utf8',
  );
  assert.match(source, /-Execute \$NodePath/);
  assert.match(source, /-WorkingDirectory \$ProjectDirectory/);
  assert.match(source, /-LogonType Interactive/);
  assert.match(source, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.doesNotMatch(source, /-Execute ["']?\$NodePath["']? ["']?\$runnerPath/);
  const privilegeCheck = source.indexOf('IsInRole($administratorRole)');
  const firstTaskStop = source.indexOf('Stop-ScheduledTask');
  assert.ok(privilegeCheck >= 0);
  assert.ok(firstTaskStop > privilegeCheck);
});
