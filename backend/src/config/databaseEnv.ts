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

/** Database from DB_*. The API and both Postgres MCP targets use this, including in development. */
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

export function resolveDatabaseConfig(_nodeEnv: string, source: NodeJS.ProcessEnv): DatabaseConfig {
  return resolveLiveDatabaseConfig(source);
}
