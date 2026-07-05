import './load-env.mjs';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { parseCliArgs } from './deploy-utils.mjs';

const args = parseCliArgs();
const skipBackup = Boolean(args['skip-backup']);
const skipBuild = Boolean(args['skip-build']);
const skipSmoke = Boolean(args['skip-smoke']);
const smokeBaseUrl = args['base-url'] || process.env.DEPLOY_BASE_URL || '';

function run(label, command, commandArgs, options = {}) {
  console.log(`\n==> ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env, ...options });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

try {
  await run('Preflight', 'npm', ['run', 'deploy:preflight']);
  if (!skipBuild) await run('CI verification', 'npm', ['run', 'verify:ci']);
  if (!skipBackup) await run('Database backup', 'npm', ['run', 'db:backup']);
  await run('Database migrations', 'npm', ['run', 'db:migrate']);
  await run('Data integrity check', 'npm', ['run', 'db:integrity']);
  if (!skipSmoke && smokeBaseUrl) {
    await run('Post-deploy smoke tests', 'npm', ['run', 'deploy:smoke', '--', '--base-url', String(smokeBaseUrl)]);
  } else if (!skipSmoke) {
    console.log('\nSkipping smoke tests because DEPLOY_BASE_URL/--base-url was not provided.');
  }
  console.log('\nDeployment release workflow completed successfully.');
} catch (error) {
  console.error(`\nDeployment release workflow failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Review docs/PRODUCTION_OPERATION_CHECKLIST.md for rollback and recovery steps.');
  process.exit(1);
}
