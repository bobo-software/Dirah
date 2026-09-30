import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DEFAULT_MIGRATIONS_FOLDER, runPendingMigrations } from '../src/db/migrationRunner';
import { convertBlockPagesIfNeeded } from '../src/convert/convertBlockPages';

async function main(): Promise<void> {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'dirah',
    password: process.env.DB_PASSWORD || 'dirah',
    database: process.env.DB_DATABASE || 'dirah',
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
