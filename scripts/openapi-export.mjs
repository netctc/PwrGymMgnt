import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import swaggerJsdoc from 'swagger-jsdoc';
import { parseCliArgs, normalizeBaseUrl } from './deploy-utils.mjs';

export function buildOpenApiSpec({ baseUrl = '', version = '1.0.0' } = {}) {
  const servers = [];
  if (baseUrl) servers.push({ url: baseUrl });
  servers.push({ url: 'http://localhost:3000' });

  return swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'PowerGym Management API',
        version,
        description: 'API documentation for PowerGym management, accounting, inventory, POS and platform operations.',
      },
      servers,
    },
    apis: ['server.ts', './server.ts', 'server/**/*.ts', './server/**/*.ts'],
  });
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return String(pkg.version || '1.0.0');
  } catch {
    return '1.0.0';
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  const args = parseCliArgs();
  const output = path.resolve(process.cwd(), String(args.output || args.o || 'docs/openapi.json'));
  const rawBaseUrl = String(args['base-url'] || process.env.API_PUBLIC_BASE_URL || process.env.DEPLOY_BASE_URL || process.env.PASSWORD_RESET_PUBLIC_BASE_URL || '').trim();
  const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : '';
  const spec = buildOpenApiSpec({ baseUrl, version: readPackageVersion() });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), output, paths: Object.keys(spec.paths || {}).length, baseUrl: baseUrl || 'http://localhost:3000' }, null, 2));
}
