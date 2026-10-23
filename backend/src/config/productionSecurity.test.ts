import { describe, expect, it } from 'vitest';
import { assertProductionSecurity, type ProductionSecurityConfig } from './env';

const ready: ProductionSecurityConfig = {
  nodeEnv: 'production',
  corsOrigin: 'https://dirah.example',
  appPublicUrl: 'https://dirah.example',
  apiPublicUrl: 'https://api.dirah.example',
  sessionCookieDomain: 'dirah.example',
  jwtSecret: 'a'.repeat(32),
  jwtRefreshSecret: 'b'.repeat(32),
  dbSsl: 'verify-full',
  minioEndpoint: '',
  allowInsecureHttp: false,
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

  it('allows a database without TLS', () => {
    expect(() => assertProductionSecurity({ ...ready, dbSsl: 'disable' })).not.toThrow();
  });

  it('rejects default secrets, wildcard CORS, and plaintext URLs', () => {
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
    expect(() => assertProductionSecurity({ ...ready, apiPublicUrl: 'https://api.dirah.example/mcp' })).not.toThrow();
    expect(() => assertProductionSecurity({ ...ready, minioEndpoint: 'http://minio.example' })).toThrow(
      /MINIO_ENDPOINT/
    );
  });

  it('allows an explicit http install only with ALLOW_INSECURE_HTTP', () => {
    const selfHosted: ProductionSecurityConfig = {
      ...ready,
      corsOrigin: 'http://localhost:8080',
      appPublicUrl: 'http://localhost:8080',
      apiPublicUrl: 'http://localhost:8080',
      sessionCookieDomain: '',
      minioEndpoint: 'http://minio:9000',
      allowInsecureHttp: true,
    };
    expect(() => assertProductionSecurity(selfHosted)).not.toThrow();

    expect(() => assertProductionSecurity({ ...selfHosted, allowInsecureHttp: false })).toThrow(
      /CORS_ORIGIN/
    );
    expect(() =>
      assertProductionSecurity({
        ...selfHosted,
        corsOrigin: 'https://localhost:8080',
        appPublicUrl: 'https://localhost:8080',
        apiPublicUrl: 'https://localhost:8080',
        allowInsecureHttp: false,
      })
    ).toThrow(/MINIO_ENDPOINT/);
    expect(() =>
      assertProductionSecurity({ ...selfHosted, minioEndpoint: 'ftp://minio:9000' })
    ).toThrow(/MINIO_ENDPOINT/);
  });

  it('requires a cookie domain that covers both hosts', () => {
    expect(() => assertProductionSecurity({ ...ready, sessionCookieDomain: '' })).toThrow(
      /SESSION_COOKIE_DOMAIN/
    );
    expect(() =>
      assertProductionSecurity({
        ...ready,
        sessionCookieDomain: '',
        apiPublicUrl: 'https://dirah.example',
      })
    ).not.toThrow();
    expect(() => assertProductionSecurity({ ...ready, sessionCookieDomain: 'example.com' })).toThrow(
      /does not cover/
    );
    expect(() =>
      assertProductionSecurity({ ...ready, sessionCookieDomain: 'https://dirah.example' })
    ).toThrow(/bare domain/);
  });
});
