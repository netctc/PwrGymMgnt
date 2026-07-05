#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const binExt = process.platform === 'win32' ? '.cmd' : '';
const requiredBins = ['vite', 'esbuild'];
const missing = requiredBins.filter((name) => !existsSync(join(root, 'node_modules', '.bin', `${name}${binExt}`)));

if (missing.length === 0) {
  process.exit(0);
}

console.log(`Build dependencies are missing (${missing.join(', ')}). Running npm ci before build...`);

const args = [
  'ci',
  '--include=dev',
  '--registry=https://registry.npmjs.org/',
  '--replace-registry-host=always',
];

const result = spawnSync('npm', args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_REPLACE_REGISTRY_HOST: 'always',
    NPM_CONFIG_PRODUCTION: 'false',
  },
});

if (result.status !== 0) {
  console.error('npm ci failed. Build cannot continue because Vite/esbuild are not installed.');
  process.exit(result.status ?? 1);
}

const stillMissing = requiredBins.filter((name) => !existsSync(join(root, 'node_modules', '.bin', `${name}${binExt}`)));
if (stillMissing.length > 0) {
  console.error(`npm ci completed, but build binaries are still missing: ${stillMissing.join(', ')}`);
  process.exit(1);
}
