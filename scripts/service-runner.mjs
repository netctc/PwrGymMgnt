#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
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

const logDirectory = path.join(projectDirectory, 'logs');
fs.mkdirSync(logDirectory, { recursive: true });
const logFile = fs.openSync(path.join(logDirectory, 'service.log'), 'a');

let child;
let stopping = false;
let restartTimer;

function log(message) {
  fs.writeSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

function finish(code = 0) {
  try { fs.closeSync(logFile); } catch {}
  process.exit(code);
}

function scheduleRestart(reason) {
  if (stopping || restartTimer) return;
  log(`${reason}; restarting in 5 seconds.`);
  restartTimer = setTimeout(() => {
    restartTimer = undefined;
    start();
  }, 5000);
}

function start() {
  log(`Starting ${path.join(projectDirectory, 'dist', 'server.cjs')}`);
  try {
    child = spawn(process.execPath, [path.join(projectDirectory, 'dist', 'server.cjs')], {
      cwd: projectDirectory,
      env: process.env,
      stdio: ['ignore', logFile, logFile],
      windowsHide: true,
    });
  } catch (error) {
    scheduleRestart(`PowerGym server could not be spawned: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  child.once('error', (error) => {
    scheduleRestart(`PowerGym server spawn failed: ${error.message}`);
  });
  child.once('exit', (code, signal) => {
    child = undefined;
    if (stopping) {
      log(`PowerGym service stopped (${signal || code || 0}).`);
      finish(0);
      return;
    }
    scheduleRestart(`PowerGym server stopped (${signal || code || 0})`);
  });
}

function stop(signal) {
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (child && !child.killed) child.kill(signal);
  else finish(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
start();
