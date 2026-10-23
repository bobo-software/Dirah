import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import { postgresSslOptions } from './postgresSsl';
import { DEFAULT_MIGRATIONS_FOLDER, runPendingMigrations } from './migrationRunner';
import { convertBlockPagesIfNeeded } from '../convert/convertBlockPages';
import * as schema from './schemas';

/**
 * Apply pending migrations and the one-off block-page conversion.
 * Shared by the dev CLI (`scripts/migrate.ts`) and the compiled runtime entry
 * (`dist/migrate.js`) used by Docker.
 */
export async function migrateCli(): Promise<void> {
  const pool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    ssl: env.db.sslMode === 'disable' ? false : postgresSslOptions(env.db.host, env.db.sslCa),
  });

  const db = drizzle(pool, { schema });

  try {
    console.log(`Applying migrations from ${DEFAULT_MIGRATIONS_FOLDER}…`);
    const result = await runPendingMigrations(db, pool);
    if (result.appliedTags.length) {
      console.log(`Applied: ${result.appliedTags.join(', ')}`);
    } else {
      console.log('No pending migrations');
    }
    const converted = await convertBlockPagesIfNeeded(db, pool);
    if (converted) {
      console.log(
        `Converted ${converted.converted} block pages (${converted.folders} folders, ${converted.encryptedNotices} encrypted notices)`
      );
    }
  } finally {
    await pool.end();
  }
}
