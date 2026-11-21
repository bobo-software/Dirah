import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import { getMcpConfig } from '../config/mcp';
import { postgresSslOptions } from './postgresSsl';
import * as schema from './schemas';

function createPool(database: typeof env.db, label: string): Pool {
  const pool = new Pool({
    host: database.host,
    port: database.port,
    user: database.user,
    password: database.password,
    database: database.database,
    max: getMcpConfig().poolLimit,
    connectionTimeoutMillis: 5_000,
    ssl: database.sslMode === 'disable' ? false : postgresSslOptions(database.host, database.sslCa),
  });

  // pg emits 'error' for an idle client whose connection drops (Postgres
  // restart, failover, network blip). An EventEmitter 'error' with no listener
  // is uncaught, so without this the whole API exits on a database blip.
  pool.on('error', (error) => {
    console.warn(`Postgres pool error (${label})`, error.message);
  });

  return pool;
}

export const pool = createPool(env.db, 'app');
export const livePool = createPool(env.liveDb, 'live');

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
