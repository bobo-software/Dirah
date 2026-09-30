export type DbSslMode = 'disable' | 'verify-full';

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslMode: DbSslMode;
};

function sslMode(raw: string | undefined): DbSslMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'verify-full') return 'verify-full';
  if (value === '' || value === 'disable') return 'disable';
  throw new Error('DB_SSL must be "disable" or "verify-full"');
}

export function resolveLocalDatabaseConfig(source: NodeJS.ProcessEnv): DatabaseConfig {
  return {
    host: (source.DB_LOCAL_HOST ?? '').trim() || 'localhost',
    port: Number(source.DB_LOCAL_PORT ?? 5432),
    user: source.DB_LOCAL_USERNAME || 'postgres',
    password: source.DB_LOCAL_PASSWORD ?? '',
    database: source.DB_LOCAL_DATABASE || 'dirah',
    sslMode: 'disable',
  };
}

/** Remote database from DB_*. Used by the deployed API and by the Postgres MCP `live` target. */
export function resolveLiveDatabaseConfig(source: NodeJS.ProcessEnv): DatabaseConfig {
  return {
    host: (source.DB_HOST ?? '').trim() || 'localhost',
    port: Number(source.DB_PORT ?? 5432),
    user: source.DB_USERNAME || 'dirah',
    password: source.DB_PASSWORD ?? 'dirah',
    database: source.DB_DATABASE || 'dirah',
    sslMode: sslMode(source.DB_SSL),
  };
}

export function resolveDatabaseConfig(nodeEnv: string, source: NodeJS.ProcessEnv): DatabaseConfig {
  if (nodeEnv === 'development') return resolveLocalDatabaseConfig(source);
  return resolveLiveDatabaseConfig(source);
}
