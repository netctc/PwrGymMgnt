import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { DATA_REPAIRS, applyRepair, getRepairPlan } from '../server/dataIntegrity';

const config = getDatabaseEnv();
const missing = getMissingDatabaseEnv(config);
const repairId = process.argv.find((arg) => arg.startsWith('--repair='))?.split('=')[1] || '';
const apply = process.argv.includes('--apply');

if (!repairId || repairId === 'list') {
  console.log('Available safe repairs:');
  for (const repair of DATA_REPAIRS) {
    console.log(`- ${repair.id}: ${repair.title}`);
  }
  console.log('\nDry-run example: npm run db:repair -- --repair=expire-access-tokens');
  console.log('Apply example:   npm run db:repair -- --repair=expire-access-tokens --apply');
  process.exit(0);
}

if (missing.length > 0) {
  console.error(`Missing database environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  connectTimeout: config.connectTimeout,
});

try {
  const result = apply
    ? await applyRepair(connection as any, repairId)
    : await getRepairPlan(connection as any, repairId);

  if (!result) {
    console.error(`Unknown repair: ${repairId}`);
    process.exit(1);
  }

  console.log(`${apply ? 'Applied' : 'Dry-run'} repair: ${result.title}`);
  console.log(`Description: ${result.description}`);
  console.log(`Recommendation: ${result.recommendation}`);
  console.log(`Affected rows: ${result.affectedRows}`);
  if ('changedRows' in result) console.log(`Changed rows: ${result.changedRows}`);
  if (!apply) console.log('No data was changed. Add --apply to execute this repair.');
} finally {
  await connection.end();
}
