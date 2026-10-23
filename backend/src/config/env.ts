import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDatabaseConfig, resolveLiveDatabaseConfig } from './databaseEnv';

const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

/**
 * One env file lives at the repo root. Fall back to `backend/.env` for older
 * checkouts, and to the process environment in containers (no file is copied).
 */
function resolveEnvFile(): string {
  if (process.env.ENV_FILE) return path.resolve(process.env.ENV_FILE);
  const cwd = process.cwd();
  const root = path.basename(cwd) === 'backend' ? path.resolve(cwd, '..') : cwd;
  const rootEnv = path.resolve(root, '.env');
  if (fs.existsSync(rootEnv)) return rootEnv;
  return path.resolve(cwd, '.env');
}

const envFilePath = resolveEnvFile();

if (!isTest) dotenv.config({ path: envFilePath });

/** Values written in the root `.env`. These win over the process environment for the system-admin login. */
function dotenvFile(): Record<string, string> {
  if (isTest) return {};
  try {
    return dotenv.parse(fs.readFileSync(envFilePath));
  } catch {
    return {};
  }
}

const dotenvValues = dotenvFile();

export type { DbSslMode } from './databaseEnv';

const DEFAULT_JWT_SECRET = 'dev-jwt-secret-change-me';
const DEFAULT_JWT_REFRESH_SECRET = 'dev-jwt-refresh-secret-change-me';
const MIN_SECRET_LENGTH = 32;

export type ProductionSecurityConfig = {
  nodeEnv: string;
  corsOrigin: string;
  appPublicUrl: string;
  apiPublicUrl: string;
  /** Bare domain shared by the web and API hosts, e.g. dirah.co.za. Empty means host-only cookies. */
  sessionCookieDomain: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  dbSsl: string;
  minioEndpoint: string;
  /** Self-hosted installs served over plain HTTP (localhost/LAN) only. */
  allowInsecureHttp: boolean;
};

function trimSlash(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function publicOrigin(raw: string, allowInsecureHttp: boolean): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const schemeAllowed =
      url.protocol === 'https:' || (allowInsecureHttp && url.protocol === 'http:');
    if (
      !schemeAllowed ||
      url.username !== '' ||
      url.password !== '' ||
      !url.hostname ||
      url.hostname === '*'
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'http:';
  } catch {
    return false;
  }
}

export function assertProductionSecurity(config: ProductionSecurityConfig): void {
  if (config.nodeEnv !== 'production') return;

  const problems: string[] = [];
  if (
    config.jwtSecret === DEFAULT_JWT_SECRET ||
    config.jwtSecret.length < MIN_SECRET_LENGTH
  ) {
    problems.push('JWT_SECRET must be a unique value of at least 32 characters');
  }
  if (
    config.jwtRefreshSecret === DEFAULT_JWT_REFRESH_SECRET ||
    config.jwtRefreshSecret.length < MIN_SECRET_LENGTH
  ) {
    problems.push('JWT_REFRESH_SECRET must be a unique value of at least 32 characters');
  }
  const schemeLabel = config.allowInsecureHttp ? 'http(s)' : 'https';
  if (!publicOrigin(config.corsOrigin, config.allowInsecureHttp)) {
    problems.push(
      `CORS_ORIGIN must be one explicit ${schemeLabel} origin, not * (received ${JSON.stringify(config.corsOrigin)})`
    );
  }
  if (!publicOrigin(config.appPublicUrl, config.allowInsecureHttp)) {
    problems.push(
      `APP_PUBLIC_URL must be a valid ${schemeLabel} origin (received ${JSON.stringify(config.appPublicUrl)})`
    );
  }
  if (!publicOrigin(config.apiPublicUrl, config.allowInsecureHttp)) {
    problems.push(
      `API_PUBLIC_URL must be a valid ${schemeLabel} origin (received ${JSON.stringify(config.apiPublicUrl)})`
    );
  }
  const cookieDomain = config.sessionCookieDomain.trim().replace(/^\./, '');
  const hostOf = (value: string): string => {
    try {
      return new URL(value).hostname;
    } catch {
      return '';
    }
  };
  const appHost = hostOf(config.appPublicUrl);
  const apiHost = hostOf(config.apiPublicUrl);
  if (!cookieDomain) {
    if (appHost && apiHost && appHost !== apiHost) {
      problems.push(
        `SESSION_COOKIE_DOMAIN is required when APP_PUBLIC_URL and API_PUBLIC_URL differ (received ${appHost} and ${apiHost}), so OAuth can set the refresh cookie for both`
      );
    }
  } else if (/[/:]/.test(cookieDomain)) {
    problems.push(`SESSION_COOKIE_DOMAIN must be a bare domain such as dirah.co.za (received ${JSON.stringify(config.sessionCookieDomain)})`);
  } else {
    for (const [label, host] of [
      ['APP_PUBLIC_URL', appHost],
      ['API_PUBLIC_URL', apiHost],
    ] as const) {
      if (host && host !== cookieDomain && !host.endsWith(`.${cookieDomain}`)) {
        problems.push(`SESSION_COOKIE_DOMAIN ${cookieDomain} does not cover the ${label} host ${host}`);
      }
    }
  }
  const minioEndpoint = config.minioEndpoint.trim();
  if (minioEndpoint && !isHttpsUrl(minioEndpoint)) {
    if (!(config.allowInsecureHttp && isHttpUrl(minioEndpoint))) {
      problems.push(
        'MINIO_ENDPOINT must use https:// when object storage is configured (http:// is allowed only with ALLOW_INSECURE_HTTP)'
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to boot in production:\n${problems.map((item) => `- ${item}`).join('\n')}`);
  }
}

function loadSslCa(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n');
  try {
    return fs.readFileSync(value, 'utf8');
  } catch {
    throw new Error(`DB_SSL_CA file could not be read: ${value}`);
  }
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const allowInsecureHttp = bool(process.env.ALLOW_INSECURE_HTTP);
const port = Number(process.env.PORT ?? 4000);
const corsOrigin =
  publicOrigin(process.env.CORS_ORIGIN ?? '', allowInsecureHttp) ??
  (process.env.CORS_ORIGIN ?? '*').trim();
const appPublicUrl = (() => {
  const explicit = publicOrigin(process.env.APP_PUBLIC_URL ?? '', allowInsecureHttp);
  if (explicit) return explicit;
  if (corsOrigin && corsOrigin !== '*') {
    return publicOrigin(corsOrigin, allowInsecureHttp) ?? trimSlash(corsOrigin);
  }
  return 'http://localhost:5181';
})();
const apiPublicRaw = (process.env.API_PUBLIC_URL ?? '').trim();
const apiPublicUrl =
  publicOrigin(apiPublicRaw, allowInsecureHttp) ??
  (apiPublicRaw || `http://localhost:${port}`);
const sessionCookieDomain = (process.env.SESSION_COOKIE_DOMAIN ?? '').trim().replace(/^\./, '');
const secureCookies = nodeEnv === 'production' && isHttpsUrl(apiPublicUrl);
const database = resolveDatabaseConfig(nodeEnv, process.env);
const liveDatabase = resolveLiveDatabaseConfig(process.env);
const minioEndpoint = process.env.MINIO_ENDPOINT ?? '';

export const env = {
  nodeEnv,
  port,
  allowInsecureHttp,
  secureCookies,
  corsOrigin,
  appPublicUrl,
  apiPublicUrl,
  sessionCookieDomain,
  smtp: {
    host: (process.env.SMTP_HOST ?? '').trim(),
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? 'true').toLowerCase() !== 'false',
    user: (process.env.SMTP_USER ?? '').trim(),
    password: process.env.SMTP_PASSWORD ?? '',
    from: (process.env.SMTP_FROM ?? 'Dirah <dirah@localhost>').trim(),
  },
  smtpConfigured: Boolean((process.env.SMTP_HOST ?? '').trim()),
  jwtSecret: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? DEFAULT_JWT_REFRESH_SECRET,
  systemAdminEmail: (dotenvValues.SYSTEM_ADMIN_EMAIL ?? process.env.SYSTEM_ADMIN_EMAIL ?? '').trim(),
  systemAdminPassword: dotenvValues.SYSTEM_ADMIN_PASSWORD || process.env.SYSTEM_ADMIN_PASSWORD || '',
  blobDir: path.resolve(process.env.BLOB_DIR ?? 'uploads'),
  ai: {
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  },
  db: {
    ...database,
    sslCa: database.sslMode === 'verify-full' ? loadSslCa(process.env.DB_SSL_CA) : undefined,
  },
  liveDb: {
    ...liveDatabase,
    sslCa: liveDatabase.sslMode === 'verify-full' ? loadSslCa(process.env.DB_SSL_CA) : undefined,
  },
  minio: {
    endpoint: minioEndpoint,
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
    bucket: process.env.MINIO_BUCKET ?? 'dirah',
    region: process.env.MINIO_REGION ?? 'us-east-1',
  },
  authRateLimit: {
    loginMax: positiveInt(process.env.AUTH_LOGIN_RATE_LIMIT, 10),
    loginWindowMs: positiveInt(process.env.AUTH_LOGIN_RATE_WINDOW_MS, 15 * 60 * 1000),
    refreshMax: positiveInt(process.env.AUTH_REFRESH_RATE_LIMIT, 120),
    refreshWindowMs: positiveInt(process.env.AUTH_REFRESH_RATE_WINDOW_MS, 60_000),
  },
};

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function bool(raw: string | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

assertProductionSecurity({
  nodeEnv: env.nodeEnv,
  corsOrigin: env.corsOrigin,
  appPublicUrl: env.appPublicUrl,
  apiPublicUrl: env.apiPublicUrl,
  sessionCookieDomain: env.sessionCookieDomain,
  jwtSecret: env.jwtSecret,
  jwtRefreshSecret: env.jwtRefreshSecret,
  dbSsl: env.db.sslMode,
  minioEndpoint: env.minio.endpoint,
  allowInsecureHttp: env.allowInsecureHttp,
});
