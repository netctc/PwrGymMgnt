import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const required = ['JWT_SECRET', 'database connection'];
const recommended = ['ADMIN_SETUP_TOKEN', 'SUPPORT_EMAIL', 'SUPPORT_PHONE'];
const dbConfig = getDatabaseEnv();

const missingRequired = [
  ...(!process.env.JWT_SECRET ? ['JWT_SECRET'] : []),
  ...getMissingDatabaseEnv(dbConfig),
];
const missingRecommended = recommended.filter((key) => !process.env[key]);

console.log('PowerGym deployment environment check');
console.log('Required variables:', `JWT_SECRET=${process.env.JWT_SECRET ? 'set' : 'missing'}, database=${getMissingDatabaseEnv(dbConfig).length === 0 ? 'set' : 'missing'}`);
console.log('Recommended variables:', recommended.map((key) => `${key}=${process.env[key] ? 'set' : 'missing'}`).join(', '));

if (missingRequired.length > 0) {
  console.error(`Missing required variables: ${missingRequired.join(', ')}`);
  process.exit(1);
}

if (missingRecommended.length > 0) {
  console.warn(`Missing recommended variables: ${missingRecommended.join(', ')}`);
}

console.log('Deployment environment check passed.');
