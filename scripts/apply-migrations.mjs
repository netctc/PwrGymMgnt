import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const dbConfig = getDatabaseEnv();
const missing = getMissingDatabaseEnv(dbConfig);

if (missing.length > 0) {
  console.error(`Missing database environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  connectTimeout: dbConfig.connectTimeout,
  multipleStatements: true,
});

/**
 * Split a SQL file into individual semicolon-terminated statements.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') { current += next; i++; inBlockComment = false; }
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && ch === '-' && next === '-') {
      inLineComment = true; current += ch; continue;
    }
    if (!inSingleQuote && !inDoubleQuote && ch === '/' && next === '*') {
      inBlockComment = true; current += ch; continue;
    }
    if (ch === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; current += ch; continue; }
    if (ch === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; current += ch; continue; }

    if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed && trimmed.replace(/[-/*\s]/g, '').length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed && trimmed.replace(/[-/*\s]/g, '').length > 0) {
    statements.push(trimmed);
  }
  return statements;
}

/**
 * Group each SET @var = (...) with its immediately following
 * PREPARE / EXECUTE / DEALLOCATE into one batch so the session
 * variable is visible when PREPARE runs.
 */
function groupStatements(statements) {
  const groups = [];
  let i = 0;
  while (i < statements.length) {
    const stmt = statements[i];
    const upper = stmt.toUpperCase().trimStart();
    if (upper.startsWith('SET @')) {
      const block = [stmt];
      let j = i + 1;
      while (j < statements.length) {
        const nUp = statements[j].toUpperCase().trimStart();
        if (nUp.startsWith('PREPARE ') || nUp.startsWith('EXECUTE ') || nUp.startsWith('DEALLOCATE ')) {
          block.push(statements[j]);
          j++;
        } else {
          break;
        }
      }
      if (block.length > 1 && block.some(s => s.toUpperCase().trimStart().startsWith('PREPARE '))) {
        groups.push({ type: 'batch', statements: block });
        i = j;
      } else {
        groups.push({ type: 'single', statement: stmt });
        i++;
      }
    } else {
      groups.push({ type: 'single', statement: stmt });
      i++;
    }
  }
  return groups;
}

async function applyFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`Applying ${fileName}...`);
  const sql = await fs.readFile(filePath, 'utf8');
  const groups = groupStatements(splitStatements(sql));
  for (const group of groups) {
    const query = group.type === 'batch'
      ? group.statements.join(';\n') + ';'
      : group.statement;
    await connection.query(query);
  }
}

try {
  const sqlDir = path.join(process.cwd(), 'sql');
  const includeSeed = process.argv.includes('--include-seed');

  // sql/ contains only: 000_master_schema.sql + any future numbered migrations.
  // Legacy migrations 001-023 have been moved to sql/archive/ for history only.
  const files = (await fs.readdir(sqlDir))
    .filter(f => f.endsWith('.sql') && !f.endsWith('.manual.sql'))
    .filter(f => includeSeed || !/seed/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    await applyFile(path.join(sqlDir, file));
  }

  console.log(`\nApplied ${files.length} migration file(s) successfully.`);
  if (!includeSeed) {
    console.log('Legacy seed files were skipped. Preview the current demo reset with:');
    console.log('npm run db:seed -- --confirm=RESET_DEMO_DATA --dry-run --json');
    console.log('After a verified backup, apply it with --backup-confirmed instead of --dry-run.');
  }
} finally {
  await connection.end();
}
