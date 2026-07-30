#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from './load-env.mjs';

const scriptProjectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const projectDirectory = path.resolve(
  process.env.POWERGYM_INSTALL_DIR || scriptProjectDirectory,
);
loadDotEnv(path.join(projectDirectory, '.env'));

let child;
let stopping = false;

function start() {
  child = spawn(process.execPath, [path.join(projectDirectory, 'dist', 'server.cjs')], {
    cwd: projectDirectory,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('exit', (code, signal) => {
    if (stopping) process.exit(code || 0);
    console.error(`PowerGym server stopped (${signal || code}); restarting in 5 seconds.`);
    setTimeout(start, 5000).unref();
  });
}

function stop(signal) {
  stopping = true;
  if (child && !child.killed) child.kill(signal);
  else process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
start();
