import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../src/config/env';
import { postgresSslOptions } from '../src/db/postgresSsl';
import { DEFAULT_MIGRATIONS_FOLDER, runPendingMigrations } from '../src/db/migrationRunner';
import { convertBlockPagesIfNeeded } from '../src/convert/convertBlockPages';

async function main(): Promise<void> {
  const pool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    ssl: env.db.sslMode === 'disable' ? false : postgresSslOptions(env.db.host, env.db.sslCa),
  });

  const db = drizzle(pool);

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

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
