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
  DB_LOCAL_HOST: 'localhost',
  DB_LOCAL_PORT: '5432',
  DB_LOCAL_USERNAME: 'postgres',
  DB_LOCAL_DATABASE: 'dirah',
  DB_LOCAL_PASSWORD: 'local-secret',
};

describe('resolveDatabaseConfig', () => {
  it('uses the local database in development and leaves TLS off', () => {
    expect(resolveDatabaseConfig('development', remote)).toEqual({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'local-secret',
      database: 'dirah',
      sslMode: 'disable',
    });
  });

  it('resolves the live database from DB_* during development', () => {
    expect(resolveLiveDatabaseConfig(remote)).toEqual({
      host: '102.218.215.251',
      port: 5441,
      user: 'dirah_user',
      password: 'remote-secret',
      database: 'dirah',
      sslMode: 'verify-full',
    });
  });

  it('uses DB_* outside development', () => {
    expect(resolveDatabaseConfig('production', remote)).toEqual({
      host: '102.218.215.251',
      port: 5441,
      user: 'dirah_user',
      password: 'remote-secret',
      database: 'dirah',
      sslMode: 'verify-full',
    });
  });
});
