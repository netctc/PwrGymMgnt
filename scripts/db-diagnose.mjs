import dns from 'node:dns/promises';
import net from 'node:net';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const config = getDatabaseEnv();
const missing = getMissingDatabaseEnv(config);

function fail(message, error) {
  console.error(`FAIL: ${message}`);
  if (error) {
    const code = error.code ? ` [${error.code}]` : '';
    console.error(`      ${error.message || error}${code}`);
  }
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function checkTcp(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      const error = new Error(`TCP timeout after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

console.log('PowerGym MySQL diagnosis');
console.log('------------------------');
console.log(`Host: ${config.host || '(missing)'}`);
console.log(`Port: ${config.port || '(missing)'}`);
console.log(`Database: ${config.database || '(missing)'}`);
console.log(`User: ${config.user || '(missing)'}`);

if (missing.length > 0) {
  fail(`Missing environment values: ${missing.join(', ')}`);
  process.exit(1);
}

let hasFailure = false;

try {
  await dns.lookup(config.host);
  pass(`DNS resolves ${config.host}`);
} catch (error) {
  hasFailure = true;
  fail(`DNS cannot resolve ${config.host}. Use localhost for local MySQL or the exact MySQL hostname from your hosting panel.`, error);
}

try {
  await checkTcp(config.host, config.port, Math.min(config.connectTimeout || 10000, 15000));
  pass(`TCP connection to ${config.host}:${config.port} succeeded`);
} catch (error) {
  hasFailure = true;
  fail(`Cannot open TCP connection to ${config.host}:${config.port}. Check firewall, remote MySQL permissions, VPN, and hosting allowlist.`, error);
}

try {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: config.connectTimeout,
  });
  const [rows] = await connection.query('SELECT DATABASE() AS database_name, CURRENT_USER() AS current_user_name');
  pass(`MySQL login succeeded as ${rows[0].current_user_name} on database ${rows[0].database_name}`);
  await connection.end();
} catch (error) {
  hasFailure = true;
  fail('MySQL login/query failed. Check username, password, database name, host, and account remote-access permissions.', error);
}

if (hasFailure) {
  console.error('\nDiagnosis failed. Fix .env and re-run: npm run db:diagnose');
  process.exit(1);
}

console.log('\nDiagnosis passed. You can run: npm run db:migrate && npm run db:verify && npm run dev');
