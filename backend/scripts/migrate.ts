import { migrateCli } from '../src/db/migrateCli';

/** Dev entrypoint: `npm run db:migrate` (ts-node). */
migrateCli().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
