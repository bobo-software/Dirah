import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import { getMcpConfig } from '../config/mcp';
import * as schema from './schemas';

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: getMcpConfig().poolLimit,
});

export const db = drizzle(pool, { schema });
export { schema };

export async function verifyDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('Database connection valid');
  } finally {
    client.release();
  }
}
