import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-jwt-refresh-secret-change-me',
};
