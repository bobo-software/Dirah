import { describe, expect, it } from 'vitest';
import { resolveDatabaseConfig, resolveLiveDatabaseConfig } from './databaseEnv';

const remote = {
  NODE_ENV: 'development',
  DB_HOST: '102.218.215.251',
  DB_PORT: '5441',
  DB_USERNAME: 'dirah_user',
  DB_PASSWORD: 'remote-secret',
  DB_DATABASE: 'dirah',
  DB_SSL: 'verify-full',
  DB_SSL_CA: '/etc/ssl/certs/coolify-ca.crt',
};

const live = {
  host: '102.218.215.251',
  port: 5441,
  user: 'dirah_user',
  password: 'remote-secret',
  database: 'dirah',
  sslMode: 'verify-full' as const,
};

describe('resolveDatabaseConfig', () => {
  it('uses the same DB_* database in development as outside it', () => {
    expect(resolveDatabaseConfig('development', remote)).toEqual(live);
    expect(resolveDatabaseConfig('production', remote)).toEqual(live);
    expect(resolveLiveDatabaseConfig(remote)).toEqual(live);
  });
});
