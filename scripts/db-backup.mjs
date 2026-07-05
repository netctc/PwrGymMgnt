import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import process from 'node:process';
import { getMissingDatabaseEnv } from './db-env.mjs';
import { buildMysqldumpArgs, getDatabaseEnvForBackup, parseCliArgs, pruneOldBackups, resolveBackupPath } from './deploy-utils.mjs';

const args = parseCliArgs();
const db = getDatabaseEnvForBackup();
const missing = getMissingDatabaseEnv(db);
const dryRun = Boolean(args['dry-run']);
const outputDir = String(args['output-dir'] || process.env.DATABASE_BACKUP_DIR || 'backups');
const retentionDays = Number(args['retention-days'] || process.env.DATABASE_BACKUP_RETENTION_DAYS || 30);
const outputFile = resolveBackupPath({
  outputDir,
  database: db.database,
  label: String(args.label || 'predeploy'),
  explicitOutput: String(args.output || ''),
});

if (missing.length > 0 && !dryRun) {
  console.error(`Missing database environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (missing.length > 0 && dryRun) {
  console.warn(`Dry-run warning: missing database environment variables: ${missing.join(', ')}`);
  db.host ||= '<db-host>';
  db.port ||= 3306;
  db.user ||= '<db-user>';
  db.database ||= '<db-name>';
}

const mysqldumpPath = String(args.mysqldump || process.env.MYSQLDUMP_PATH || 'mysqldump');
const dumpArgs = buildMysqldumpArgs(db, args['extra-arg'] ? [String(args['extra-arg'])] : []);

function cleanupPartialBackup(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

function printMissingMysqldumpHelp(binaryPath) {
  console.error(`Unable to start mysqldump (${binaryPath}).`);
  console.error('Install MySQL Client tools or pass the full mysqldump path.');
  console.error('Windows examples:');
  console.error('  npm run db:backup -- --label=manual --mysqldump="C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe"');
  console.error('  set MYSQLDUMP_PATH=C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe');
  console.error('Then run: npm run db:backup -- --label=manual');
}

console.log('PowerGym database backup');
console.log('------------------------');
console.log(`Target: ${outputFile}`);
console.log(`Database: ${db.database}@${db.host}:${db.port}`);
console.log(`Retention: ${retentionDays} day(s)`);
console.log(`mysqldump: ${mysqldumpPath}`);

if (dryRun) {
  console.log('Dry-run only; no backup file was created.');
  console.log(`Command: ${mysqldumpPath} ${dumpArgs.join(' ')} > ${outputFile}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
const writeStream = fs.createWriteStream(outputFile, { flags: 'wx' });
const child = spawn(mysqldumpPath, dumpArgs, {
  env: { ...process.env, MYSQL_PWD: db.password },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
let spawnError = null;
const pipePromise = pipeline(child.stdout, writeStream).catch((error) => error);
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

const exitCode = await new Promise((resolve) => {
  child.once('error', (error) => {
    spawnError = error;
    resolve(null);
  });
  child.once('close', resolve);
});

const pipeError = await pipePromise;

if (spawnError) {
  writeStream.destroy();
  cleanupPartialBackup(outputFile);
  if (spawnError.code === 'ENOENT') {
    printMissingMysqldumpHelp(mysqldumpPath);
  } else {
    console.error(`Unable to start mysqldump (${mysqldumpPath}): ${spawnError.message}`);
  }
  process.exit(1);
}

if (pipeError instanceof Error) {
  cleanupPartialBackup(outputFile);
  console.error(`Backup stream failed: ${pipeError.message}`);
  process.exit(1);
}

if (exitCode !== 0) {
  cleanupPartialBackup(outputFile);
  console.error(stderr || `mysqldump exited with code ${exitCode}`);
  process.exit(Number(exitCode) || 1);
}

const stat = fs.statSync(outputFile);
if (stat.size <= 0) {
  cleanupPartialBackup(outputFile)
  console.error('Backup file was empty; refusing to continue.');
  process.exit(1);
}

const removed = pruneOldBackups({ directory: path.dirname(outputFile), retentionDays });
console.log(`Backup created: ${outputFile}`);
console.log(`Size: ${stat.size} bytes`);
if (removed.length > 0) console.log(`Pruned ${removed.length} old backup(s).`);
