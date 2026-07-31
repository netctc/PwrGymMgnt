#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_DIR = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_UNIT_DIR = '/etc/systemd/system';

function systemdQuote(value) {
  const text = String(value);
  if (/[\r\n]/.test(text)) throw new Error('Systemd paths must not contain line breaks.');
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function parseLinuxServiceArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: false,
    serviceUser: '',
    projectDir: DEFAULT_PROJECT_DIR,
    nodePath: process.execPath,
    unitDir: DEFAULT_UNIT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const [name, inlineValue] = token.startsWith('--')
      ? token.slice(2).split('=', 2)
      : ['', undefined];
    if (!name) throw new Error(`Unknown option: ${token}`);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value) throw new Error(`Missing value for --${name}`);
    if (name === 'service-user') args.serviceUser = String(value);
    else if (name === 'project-dir') args.projectDir = path.resolve(String(value));
    else if (name === 'node-path') args.nodePath = path.resolve(String(value));
    else if (name === 'unit-dir') args.unitDir = path.resolve(String(value));
    else throw new Error(`Unknown option: --${name}`);
  }
  return args;
}

export function buildLinuxSystemdUnits({
  projectDir,
  nodePath,
  serviceUser,
  serviceGroup,
}) {
  if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(serviceUser)) {
    throw new Error(`Unsafe Linux service user: ${serviceUser}`);
  }
  if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(serviceGroup)) {
    throw new Error(`Unsafe Linux service group: ${serviceGroup}`);
  }
  const envPath = path.join(projectDir, '.env');
  const runnerPath = path.join(projectDir, 'scripts', 'service-runner.mjs');
  const monitorPath = path.join(projectDir, 'scripts', 'monitor-installation.mjs');
  const common = `User=${serviceUser}\nGroup=${serviceGroup}\nWorkingDirectory=${systemdQuote(projectDir)}\nEnvironmentFile=${systemdQuote(envPath)}\n`;
  return {
    'powergym.service': `[Unit]\nDescription=PowerGym Management\nWants=network-online.target\nAfter=network-online.target mysql.service\n\n[Service]\nType=simple\n${common}ExecStart=${systemdQuote(nodePath)} ${systemdQuote(runnerPath)}\nRestart=always\nRestartSec=5\nTimeoutStopSec=30\nNoNewPrivileges=true\nPrivateTmp=true\nUMask=0027\n\n[Install]\nWantedBy=multi-user.target\n`,
    'powergym-health.service': `[Unit]\nDescription=PowerGym installation health check\nAfter=powergym.service\n\n[Service]\nType=oneshot\n${common}ExecStart=${systemdQuote(nodePath)} ${systemdQuote(monitorPath)}\nNoNewPrivileges=true\nPrivateTmp=true\nUMask=0027\n`,
    'powergym-health.timer': `[Unit]\nDescription=Run PowerGym health check every five minutes\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\nPersistent=true\nUnit=powergym-health.service\n\n[Install]\nWantedBy=timers.target\n`,
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || DEFAULT_PROJECT_DIR,
      env: options.env || process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(options.capture ? stdout.trim() : undefined);
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function disableLegacyUserUnits(projectDir) {
  try {
    await run(
      'systemctl',
      ['--user', 'disable', '--now', 'powergym.service', 'powergym-health.timer'],
      { cwd: projectDir, capture: true },
    );
  } catch {
    // A fresh installation has no legacy user units.
  }
}

async function ensureServiceAccount(serviceUser) {
  try {
    await run('id', ['-u', serviceUser], { capture: true });
  } catch {
    await run('useradd', [
      '--system',
      '--create-home',
      '--home-dir',
      `/var/lib/${serviceUser}`,
      '--shell',
      '/usr/sbin/nologin',
      serviceUser,
    ]);
  }
  const uid = Number(await run('id', ['-u', serviceUser], { capture: true }));
  const gid = Number(await run('id', ['-g', serviceUser], { capture: true }));
  const serviceGroup = await run('id', ['-gn', serviceUser], { capture: true });
  if (!Number.isInteger(uid) || !Number.isInteger(gid)) {
    throw new Error(`Unable to resolve Linux service account: ${serviceUser}`);
  }
  return { uid, gid, serviceGroup };
}

async function chownTree(target, uid, gid) {
  const stats = await fs.lstat(target);
  if (stats.isDirectory()) {
    const entries = await fs.readdir(target);
    for (const entry of entries) {
      await chownTree(path.join(target, entry), uid, gid);
    }
  }
  if (!stats.isSymbolicLink()) await fs.chown(target, uid, gid);
}

async function prepareRuntimePermissions(projectDir, uid, gid) {
  const envPath = path.join(projectDir, '.env');
  await fs.chown(envPath, uid, gid);
  await fs.chmod(envPath, 0o600);
  for (const directoryName of ['logs', 'backups', 'release-evidence']) {
    const directory = path.join(projectDir, directoryName);
    await fs.mkdir(directory, { recursive: true, mode: 0o750 });
    await chownTree(directory, uid, gid);
  }
}

async function installAsRoot({ projectDir, nodePath, serviceUser, unitDir }) {
  const requiredPaths = [
    projectDir,
    nodePath,
    path.join(projectDir, '.env'),
    path.join(projectDir, 'dist', 'server.cjs'),
    path.join(projectDir, 'scripts', 'service-runner.mjs'),
    path.join(projectDir, 'scripts', 'monitor-installation.mjs'),
  ];
  for (const requiredPath of requiredPaths) {
    try {
      await fs.access(requiredPath);
    } catch {
      throw new Error(`Required Linux service path was not found: ${requiredPath}`);
    }
  }
  const account = await ensureServiceAccount(serviceUser);
  await prepareRuntimePermissions(projectDir, account.uid, account.gid);
  const units = buildLinuxSystemdUnits({
    projectDir,
    nodePath,
    serviceUser,
    serviceGroup: account.serviceGroup,
  });
  await fs.mkdir(unitDir, { recursive: true });
  const previous = new Map();
  for (const [fileName, content] of Object.entries(units)) {
    const destination = path.join(unitDir, fileName);
    try {
      previous.set(destination, await fs.readFile(destination, 'utf8'));
    } catch {
      previous.set(destination, null);
    }
    await fs.writeFile(destination, content, { mode: 0o644 });
  }
  const unitPaths = Object.keys(units).map((fileName) => path.join(unitDir, fileName));
  try {
    await run('systemd-analyze', ['verify', ...unitPaths], { capture: true });
    await run('systemctl', ['daemon-reload']);
    await run('systemctl', ['enable', 'powergym.service', 'powergym-health.timer']);
    await run('systemctl', ['restart', 'powergym.service']);
    await run('systemctl', ['start', 'powergym-health.timer']);
  } catch (error) {
    for (const [destination, content] of previous) {
      if (content === null) await fs.rm(destination, { force: true });
      else await fs.writeFile(destination, content, { mode: 0o644 });
    }
    await run('systemctl', ['daemon-reload']).catch(() => undefined);
    throw error;
  }
  console.log(`Linux system services registered for ${serviceUser}:${account.serviceGroup}.`);
  console.log(`PowerGym working directory: ${projectDir}`);
}

export async function installLinuxSystemServices(options = {}) {
  const projectDir = path.resolve(options.projectDir || DEFAULT_PROJECT_DIR);
  const nodePath = path.resolve(options.nodePath || process.execPath);
  const serviceUser = String(
    options.serviceUser
      || process.env.SUDO_USER
      || (os.userInfo().username === 'root' ? 'powergym' : os.userInfo().username),
  );
  const unitDir = path.resolve(options.unitDir || DEFAULT_UNIT_DIR);
  if (options.dryRun) {
    const units = buildLinuxSystemdUnits({
      projectDir,
      nodePath,
      serviceUser: serviceUser === 'root' ? 'powergym' : serviceUser,
      serviceGroup: serviceUser === 'root' ? 'powergym' : serviceUser,
    });
    console.log(`[dry-run] would install system units in ${unitDir}`);
    console.log(`[dry-run] units: ${Object.keys(units).join(', ')}`);
    return;
  }
  if (process.platform !== 'linux') {
    throw new Error(`Linux services can only be installed on Linux; current platform is ${process.platform}.`);
  }
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    if (serviceUser === 'root') {
      throw new Error('Run this command as a normal deployment user with sudo access.');
    }
    await disableLegacyUserUnits(projectDir);
    await run('sudo', [
      nodePath,
      SCRIPT_PATH,
      `--service-user=${serviceUser}`,
      `--project-dir=${projectDir}`,
      `--node-path=${nodePath}`,
      `--unit-dir=${unitDir}`,
    ], { cwd: projectDir });
    return;
  }
  if (!serviceUser || serviceUser === 'root') {
    throw new Error('Specify the non-root deployment account with --service-user.');
  }
  await installAsRoot({ projectDir, nodePath, serviceUser, unitDir });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isMain) {
  const args = parseLinuxServiceArgs();
  installLinuxSystemServices(args).catch((error) => {
    console.error(`Linux service installation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
