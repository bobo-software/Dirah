import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  appPublicUrl: (() => {
    const explicit = (process.env.APP_PUBLIC_URL ?? '').trim().replace(/\/$/, '');
    if (explicit) return explicit;
    const cors = process.env.CORS_ORIGIN ?? '';
    if (cors && cors !== '*') return cors.replace(/\/$/, '');
    return 'http://localhost:5181';
  })(),
  smtpUrl: process.env.SMTP_URL ?? '',
  smtpFrom: process.env.SMTP_FROM ?? 'Dira <dira@localhost>',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-jwt-refresh-secret-change-me',
  blobDir: path.resolve(process.env.BLOB_DIR ?? 'uploads'),
  snapshotEvery: Number(process.env.DOC_SNAPSHOT_EVERY ?? 50),
  ai: {
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'dira',
    password: process.env.DB_PASSWORD ?? 'dira',
    database: process.env.DB_DATABASE ?? 'dira',
  },
  redisUrl: process.env.REDIS_URL ?? '',
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? '',
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
    bucket: process.env.MINIO_BUCKET ?? 'dira',
    region: process.env.MINIO_REGION ?? 'us-east-1',
  },
};
