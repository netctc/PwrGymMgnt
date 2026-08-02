import mysql from 'mysql2/promise';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { reconcileMembershipStatuses } from '../server/membershipReconciliation';

async function main() {
  const apply = process.argv.includes('--apply');
  const json = process.argv.includes('--json');
  const config = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(config);
  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: config.connectTimeout,
    connectionLimit: 1,
  });
  try {
    const result = await reconcileMembershipStatuses(pool as any, { apply });
    if (json) {
      console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));
      return;
    }
    console.log('PowerGym membership reconciliation');
    console.log('----------------------------------');
    console.log(`Mode: ${result.mode}`);
    console.log(`Active members without current subscription: ${result.checked}`);
    console.log(`Deactivated: ${result.deactivated}`);
    if (!apply && result.candidates.length > 0) {
      for (const member of result.candidates) {
        const name = `${member.first_name || ''} ${member.last_name || ''}`.trim();
        console.log(`- ${member.id}${name ? ` | ${name}` : ''}${member.email ? ` | ${member.email}` : ''}`);
      }
      console.log('No data was changed. Add --apply to deactivate these members.');
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`Membership reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
