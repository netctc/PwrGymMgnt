import './load-env.mjs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import process from 'node:process';
import { getMissingDatabaseEnv } from './db-env.mjs';
import { boolEnv, parseCliArgs } from './deploy-utils.mjs';
import {
  RESTORE_CONFIRMATION,
  buildMysqlRestoreArgs,
  createRestorePlan,
  getDatabaseEnvForRestore,
  inspectSqlBackup,
  listManagedBackups,
  resolveManagedBackupPath,
} from './db-restore-utils.mjs';

const args = parseCliArgs();
const backupDir = String(args['backup-dir'] || process.env.DATABASE_BACKUP_DIR || 'backups');
const mysqlPath = String(args.mysql || process.env.MYSQL_PATH || 'mysql');
const json = Boolean(args.json);

function printMissingMysqlHelp(binaryPath) {
  console.error(`Unable to start mysql client (${binaryPath}).`);
  console.error('Install MySQL Client tools or pass the full mysql path.');
  console.error('Windows examples:');
  console.error('  npm run db:restore -- --backup=<file.sql> --inspect');
  console.error('  npm run db:restore -- --backup=<file.sql> --apply --confirm=RESTORE --mysql="C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe"');
  console.error('  set MYSQL_PATH=C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe');
}


function output(data) {
  if (json) console.log(JSON.stringify(data, null, 2));
  else console.log(data);
}

if (args.list) {
  const backups = listManagedBackups({ backupDir }).map(({ path, ...backup }) => backup);
  if (json) output({ backupDir, backups });
  else if (backups.length === 0) output('No managed backups found.');
  else backups.forEach((backup) => {
    const validity = backup.size > 0 ? '' : '\tINVALID: empty file; delete it before restoring';
    output(`${backup.name}\t${backup.size} bytes\t${backup.modifiedAt.toISOString?.() || backup.modifiedAt}${validity}`);
  });
  process.exit(0);
}

const backupName = args.backup || args.name || args._?.[0];
if (!backupName) {
  console.error(`Usage: npm run db:restore -- --backup=<file.sql> [--inspect|--apply --confirm=${RESTORE_CONFIRMATION}]`);
  process.exit(1);
}

const resolved = resolveManagedBackupPath({ backupDir, name: String(backupName) });
if (!resolved || !fs.existsSync(resolved.filePath)) {
  const message = 'Backup file was not found in the managed backup directory, or the name is unsafe.';
  if (json) output({ error: message, backupDir, requestedBackup: String(backupName) });
  else console.error(message);
  process.exit(1);
}

const inspection = inspectSqlBackup({ filePath: resolved.filePath });
const db = getDatabaseEnvForRestore();
const apply = Boolean(args.apply);
const allowDestructive = Boolean(args['allow-destructive']) || boolEnv(process.env.DATABASE_RESTORE_ALLOW_DESTRUCTIVE);
const allowProductionRestore = Boolean(args['allow-production-restore']) || boolEnv(process.env.DATABASE_RESTORE_ALLOW_PRODUCTION);
const plan = createRestorePlan({
  inspection,
  apply,
  confirmation: String(args.confirm || ''),
  allowDestructive,
  allowProductionRestore,
  apiRestoreEnabled: true,
  nodeEnv: process.env.NODE_ENV || 'development',
  db,
});

if (args.inspect || !apply) {
  const report = {
    backup: { name: resolved.fileName, path: resolved.filePath },
    inspection: { ...inspection, preview: undefined },
    plan,
  };
  if (json) output(report);
  else {
    output(`Backup: ${resolved.fileName}`);
    output(`Size: ${inspection.metrics?.sizeBytes || 0} bytes`);
    output(`SHA-256: ${inspection.metrics?.sha256 || '-'}`);
    output(`Inspection: ${inspection.ok ? 'OK' : 'BLOCKED'}`);
    [...inspection.errors, ...inspection.warnings].forEach((message) => output(`- ${message}`));
    output(`Apply allowed: ${plan.canApply ? 'yes' : 'no'}`);
    plan.blockers.forEach((message) => output(`BLOCKER: ${message}`));
  }
  process.exit(plan.blockers.length > 0 && apply ? 1 : 0);
}

if (!plan.canApply) {
  if (json) output({ backup: resolved.fileName, inspection, plan });
  else plan.blockers.forEach((message) => console.error(`BLOCKER: ${message}`));
  process.exit(1);
}

const missing = getMissingDatabaseEnv(db);
if (missing.length > 0) {
  console.error(`Missing database environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Restoring ${resolved.fileName} into ${db.database}@${db.host}:${db.port}`);
console.log(`mysql: ${mysqlPath}`);
const mysqlArgs = buildMysqlRestoreArgs(db, args['extra-arg'] ? [String(args['extra-arg'])] : []);
const child = spawn(mysqlPath, mysqlArgs, {
  env: { ...process.env, MYSQL_PWD: db.password },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderr = '';
let spawnError = null;
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
const pipePromise = pipeline(fs.createReadStream(resolved.filePath), child.stdin).catch((error) => error);

const exitCode = await new Promise((resolve) => {
  child.once('error', (error) => {
    spawnError = error;
    resolve(null);
  });
  child.once('close', resolve);
});
const pipeError = await pipePromise;

if (spawnError) {
  if (spawnError.code === 'ENOENT') {
    printMissingMysqlHelp(mysqlPath);
  } else {
    console.error(`Unable to start mysql client (${mysqlPath}): ${spawnError.message}`);
  }
  process.exit(1);
}

if (pipeError instanceof Error) {
  console.error(`Restore stream failed: ${pipeError.message}`);
  process.exit(1);
}

if (exitCode !== 0) {
  console.error(stderr || `mysql exited with code ${exitCode}`);
  process.exit(Number(exitCode) || 1);
}

console.log('Restore completed successfully. Run npm run deploy:smoke and npm run db:integrity next.');
