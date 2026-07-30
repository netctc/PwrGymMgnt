#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseWindowsServiceArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false, start: true };
  for (const token of argv) {
    if (token === '--dry-run') args.dryRun = true;
    else if (token === '--no-start') args.start = false;
    else throw new Error(`Unknown option: ${token}`);
  }
  return args;
}

export function buildPowerShellArgs({
  projectDir = PROJECT_DIR,
  nodePath = process.execPath,
  start = true,
} = {}) {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(projectDir, 'scripts', 'register-windows-tasks.ps1'),
    '-ProjectDirectory',
    projectDir,
    '-NodePath',
    nodePath,
    ...(start ? ['-StartService'] : []),
  ];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || PROJECT_DIR,
      env: options.env || process.env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export async function installWindowsScheduledTasks({
  projectDir = PROJECT_DIR,
  nodePath = process.execPath,
  env = process.env,
  dryRun = false,
  start = true,
} = {}) {
  const args = buildPowerShellArgs({ projectDir, nodePath, start });
  if (dryRun) {
    console.log(`[dry-run] powershell.exe ${args.join(' ')}`);
    return;
  }
  if (process.platform !== 'win32') {
    throw new Error(`Windows scheduled tasks can only be installed on Windows; current platform is ${process.platform}.`);
  }
  await run('powershell.exe', args, { cwd: projectDir, env });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseWindowsServiceArgs();
  installWindowsScheduledTasks(args).catch((error) => {
    console.error(`Windows service repair failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
