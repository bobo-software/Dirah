import { migrateCli } from './db/migrateCli';

/** Runtime migration entrypoint: `node dist/migrate.js` in the Docker image. */
migrateCli().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
