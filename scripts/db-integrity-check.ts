import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { runIntegrityChecks, summarizeIntegrityFindings, sortFindings } from '../server/dataIntegrity';

const config = getDatabaseEnv();
const missing = getMissingDatabaseEnv(config);
const jsonMode = process.argv.includes('--json');

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
  const findings = sortFindings(await runIntegrityChecks(connection as any));
  const summary = summarizeIntegrityFindings(findings);

  if (jsonMode) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), summary, findings }, null, 2));
  } else {
    console.log('PowerGym data integrity check');
    console.log('-----------------------------');
    console.log(`Posture: ${summary.posture}`);
    console.log(`Checks: ${summary.totalChecks} | Passing: ${summary.passing} | Failing: ${summary.failing}`);
    console.log(`Critical: ${summary.critical} | Warning: ${summary.warning} | Affected rows: ${summary.affectedRows}`);
    console.log('');

    for (const finding of findings.filter((item) => item.status === 'fail')) {
      console.log(`[${finding.severity.toUpperCase()}] ${finding.module} :: ${finding.title}`);
      console.log(`  Rows: ${finding.count}`);
      console.log(`  Recommendation: ${finding.recommendation}`);
    }

    if (summary.failing === 0) {
      console.log('No integrity issues detected.');
    }
  }

  process.exit(summary.critical > 0 ? 2 : 0);
} finally {
  await connection.end();
}
