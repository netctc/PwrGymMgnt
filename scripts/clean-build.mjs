#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const targets = ['dist', 'server.js'];

for (const target of targets) {
  await fs.rm(path.join(projectRoot, target), { recursive: true, force: true });
}

console.log(`Removed build artifacts: ${targets.join(', ')}`);
