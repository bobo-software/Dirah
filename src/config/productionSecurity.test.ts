import { describe, expect, it } from 'vitest';
import { assertProductionSecurity, type ProductionSecurityConfig } from './env';

const ready: ProductionSecurityConfig = {
  nodeEnv: 'production',
  corsOrigin: 'https://dirah.example',
  appPublicUrl: 'https://dirah.example',
  apiPublicUrl: 'https://api.example',
  jwtSecret: 'a'.repeat(32),
  jwtRefreshSecret: 'b'.repeat(32),
  dbSsl: 'verify-full',
  minioEndpoint: '',
};

describe('production boot checks', () => {
  it('allows a complete production config', () => {
    expect(() => assertProductionSecurity(ready)).not.toThrow();
    expect(() =>
      assertProductionSecurity({ ...ready, minioEndpoint: 'https://minio.example' })
    ).not.toThrow();
  });

  it('does not apply outside production', () => {
    expect(() =>
      assertProductionSecurity({
        ...ready,
        nodeEnv: 'development',
        corsOrigin: '*',
        appPublicUrl: 'http://localhost:5181',
        apiPublicUrl: 'http://localhost:4006',
        jwtSecret: 'dev-jwt-secret-change-me',
        jwtRefreshSecret: 'dev-jwt-refresh-secret-change-me',
        dbSsl: 'disable',
        minioEndpoint: 'http://localhost:9000',
      })
    ).not.toThrow();
  });

  it('rejects default secrets, wildcard CORS, plaintext URLs, and a database without TLS', () => {
    expect(() => assertProductionSecurity({ ...ready, jwtSecret: 'dev-jwt-secret-change-me' })).toThrow(
      /JWT_SECRET/
    );
    expect(() => assertProductionSecurity({ ...ready, jwtSecret: 'short' })).toThrow(/JWT_SECRET/);
    expect(() =>
      assertProductionSecurity({ ...ready, jwtRefreshSecret: 'dev-jwt-refresh-secret-change-me' })
    ).toThrow(/JWT_REFRESH_SECRET/);
    expect(() => assertProductionSecurity({ ...ready, corsOrigin: '*' })).toThrow(/CORS_ORIGIN/);
    expect(() => assertProductionSecurity({ ...ready, appPublicUrl: 'http://dirah.example' })).toThrow(
      /APP_PUBLIC_URL/
    );
    expect(() => assertProductionSecurity({ ...ready, apiPublicUrl: 'http://api.example' })).toThrow(
      /API_PUBLIC_URL/
    );
    expect(() => assertProductionSecurity({ ...ready, dbSsl: 'disable' })).toThrow(/DB_SSL/);
    expect(() => assertProductionSecurity({ ...ready, dbSsl: '' })).toThrow(/DB_SSL/);
    expect(() => assertProductionSecurity({ ...ready, minioEndpoint: 'http://minio.example' })).toThrow(
      /MINIO_ENDPOINT/
    );
  });
});
