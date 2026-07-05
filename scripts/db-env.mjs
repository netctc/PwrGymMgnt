export function envFirst(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

export function getDatabaseEnv() {
  return {
    host: envFirst('DATABASE_HOSTNAME', 'DB_HOST'),
    port: Number(envFirst('DATABASE_PORT', 'DB_PORT') || 3306),
    user: envFirst('DATABASE_USER_NAME', 'DB_USER'),
    password: envFirst('DATABASE_PASSWORD', 'DB_PASSWORD'),
    database: envFirst('DATABASE_NAME', 'DB_NAME'),
    connectTimeout: Number(envFirst('DATABASE_CONNECT_TIMEOUT_MS', 'DB_CONNECT_TIMEOUT_MS') || 10000),
  };
}

export function getMissingDatabaseEnv(config = getDatabaseEnv()) {
  return [
    ['DATABASE_HOSTNAME or DB_HOST', config.host],
    ['DATABASE_USER_NAME or DB_USER', config.user],
    ['DATABASE_PASSWORD or DB_PASSWORD', config.password],
    ['DATABASE_NAME or DB_NAME', config.database],
  ].filter(([, value]) => !value).map(([name]) => name);
}
