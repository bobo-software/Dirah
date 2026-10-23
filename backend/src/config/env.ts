import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDatabaseConfig, resolveLiveDatabaseConfig } from './databaseEnv';

dotenv.config();

/** Values written in `.env`. These win over Infisical for the system-admin login. */
function dotenvFile(): Record<string, string> {
  const filePath = path.resolve(process.cwd(), '.env');
  try {
    return dotenv.parse(fs.readFileSync(filePath));
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
  jwtSecret: string;
  jwtRefreshSecret: string;
  dbSsl: string;
  minioEndpoint: string;
};

function trimSlash(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function httpsOrigin(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (
      url.protocol !== 'https:' ||
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
  if (!httpsOrigin(config.corsOrigin)) {
    problems.push(`CORS_ORIGIN must be one explicit https origin, not * (received ${JSON.stringify(config.corsOrigin)})`);
  }
  if (!httpsOrigin(config.appPublicUrl)) {
    problems.push(`APP_PUBLIC_URL must be an https origin (received ${JSON.stringify(config.appPublicUrl)})`);
  }
  if (!httpsOrigin(config.apiPublicUrl)) {
    problems.push(`API_PUBLIC_URL must be an https origin (received ${JSON.stringify(config.apiPublicUrl)})`);
  }
  const minioEndpoint = config.minioEndpoint.trim();
  if (minioEndpoint && !isHttpsUrl(minioEndpoint)) {
    problems.push('MINIO_ENDPOINT must use https:// when object storage is configured');
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
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = httpsOrigin(process.env.CORS_ORIGIN ?? '') ?? (process.env.CORS_ORIGIN ?? '*').trim();
const appPublicUrl = (() => {
  const explicit = httpsOrigin(process.env.APP_PUBLIC_URL ?? '');
  if (explicit) return explicit;
  if (corsOrigin && corsOrigin !== '*') return httpsOrigin(corsOrigin) ?? trimSlash(corsOrigin);
  return 'http://localhost:5181';
})();
const apiPublicRaw = (process.env.API_PUBLIC_URL ?? '').trim();
const apiPublicUrl = httpsOrigin(apiPublicRaw) ?? (apiPublicRaw || `http://localhost:${port}`);
const database = resolveDatabaseConfig(nodeEnv, process.env);
const liveDatabase = resolveLiveDatabaseConfig(process.env);
const minioEndpoint = process.env.MINIO_ENDPOINT ?? '';

export const env = {
  nodeEnv,
  port,
  corsOrigin,
  appPublicUrl,
  apiPublicUrl,
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

assertProductionSecurity({
  nodeEnv: env.nodeEnv,
  corsOrigin: env.corsOrigin,
  appPublicUrl: env.appPublicUrl,
  apiPublicUrl: env.apiPublicUrl,
  jwtSecret: env.jwtSecret,
  jwtRefreshSecret: env.jwtRefreshSecret,
  dbSsl: env.db.sslMode,
  minioEndpoint: env.minio.endpoint,
});
