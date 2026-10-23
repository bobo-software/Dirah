import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export const DEFAULT_MIGRATIONS_FOLDER = path.join(
  __dirname,
  '..',
  '..',
  'drizzle',
  'migrations'
);

const MIGRATIONS_TABLE = '__drizzle_migrations';
const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE_QUALIFIED = `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`;

export interface Queryable {
  query: (
    queryText: string,
    values?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export type MigratableDb = Parameters<typeof migrate>[0];

export interface MigrationStatusEntry {
  idx: number;
  tag: string;
  when: number;
  applied: boolean;
  storedHash?: string;
  computedHash: string;
  hashMismatch: boolean;
}

export interface MigrationStatus {
  migrationsTable: string;
  tableExists: boolean;
  folderMissing: boolean;
  totalEntries: number;
  appliedCount: number;
  pendingCount: number;
  lastAppliedTag: string | null;
  lastAppliedAt: number | null;
  entries: MigrationStatusEntry[];
  inSync: boolean;
}

export interface RunMigrationsResult {
  before: MigrationStatus;
  after: MigrationStatus;
  appliedTags: string[];
  durationMs: number;
}

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

function journalPath(folder: string): string {
  return path.join(folder, 'meta', '_journal.json');
}

function readJournal(folder: string): JournalEntry[] {
  const file = journalPath(folder);
  if (!fs.existsSync(file)) {
    return [];
  }
  const journal = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
    entries: JournalEntry[];
  };
  return journal.entries ?? [];
}

function computeHash(folder: string, tag: string): string {
  const sqlPath = path.join(folder, `${tag}.sql`);
  const contents = fs.readFileSync(sqlPath, 'utf-8');
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function emptyStatus(tableExists: boolean, folderMissing: boolean): MigrationStatus {
  return {
    migrationsTable: MIGRATIONS_TABLE_QUALIFIED,
    tableExists,
    folderMissing,
    totalEntries: 0,
    appliedCount: 0,
    pendingCount: 0,
    lastAppliedTag: null,
    lastAppliedAt: null,
    entries: [],
    inSync: true,
  };
}

/**
 * Read-only snapshot of applied vs. pending Drizzle migrations.
 *
 * Mirrors drizzle-orm's own migrate() cutoff logic (compares journal entries
 * against the single most-recently-applied row's created_at).
 */
export async function getMigrationStatus(
  queryable: Queryable,
  folder: string = DEFAULT_MIGRATIONS_FOLDER
): Promise<MigrationStatus> {
  const folderMissing = !fs.existsSync(journalPath(folder));
  const journalEntries = readJournal(folder);

  const existsResult = await queryable.query(
    `SELECT COUNT(*)::int AS cnt
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2`,
    [MIGRATIONS_SCHEMA, MIGRATIONS_TABLE]
  );
  const tableExists = Number(existsResult.rows[0]?.cnt ?? 0) > 0;

  if (folderMissing) {
    return emptyStatus(tableExists, true);
  }

  let appliedRows: Array<Record<string, unknown>> = [];
  if (tableExists) {
    const result = await queryable.query(
      `SELECT hash, created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at ASC`
    );
    appliedRows = result.rows;
  }

  const lastAppliedRow = appliedRows[appliedRows.length - 1];
  const lastAppliedAt = lastAppliedRow ? Number(lastAppliedRow.created_at) : null;
  const appliedByWhen = new Map<number, string>(
    appliedRows.map((row) => [Number(row.created_at), String(row.hash)])
  );

  const entries: MigrationStatusEntry[] = journalEntries.map((entry) => {
    const computedHash = computeHash(folder, entry.tag);
    const storedHash = appliedByWhen.get(entry.when);
    const applied = lastAppliedAt != null && entry.when <= lastAppliedAt;
    return {
      idx: entry.idx,
      tag: entry.tag,
      when: entry.when,
      applied,
      storedHash,
      computedHash,
      hashMismatch: storedHash != null && storedHash !== computedHash,
    };
  });

  const appliedCount = entries.filter((entry) => entry.applied).length;
  const pendingCount = entries.length - appliedCount;
  const lastApplied = entries.filter((entry) => entry.applied).at(-1);

  return {
    migrationsTable: MIGRATIONS_TABLE_QUALIFIED,
    tableExists,
    folderMissing: false,
    totalEntries: entries.length,
    appliedCount,
    pendingCount,
    lastAppliedTag: lastApplied?.tag ?? null,
    lastAppliedAt: lastApplied?.when ?? null,
    entries,
    inSync: pendingCount === 0 && !entries.some((entry) => entry.hashMismatch),
  };
}

/**
 * Apply pending Drizzle migrations, reporting before/after status.
 * Shared by scripts/migrate.ts and the pg_run_migrations MCP tool.
 */
export async function runPendingMigrations(
  db: MigratableDb,
  queryable: Queryable,
  folder: string = DEFAULT_MIGRATIONS_FOLDER
): Promise<RunMigrationsResult> {
  const before = await getMigrationStatus(queryable, folder);
  if (before.folderMissing) {
    throw new Error(
      `No Drizzle migrations found at ${folder}. Generate some with npm run db:generate first.`
    );
  }

  const started = Date.now();
  await migrate(db, { migrationsFolder: folder });
  const after = await getMigrationStatus(queryable, folder);

  const previouslyApplied = new Set(
    before.entries.filter((entry) => entry.applied).map((entry) => entry.tag)
  );
  const appliedTags = after.entries
    .filter((entry) => entry.applied && !previouslyApplied.has(entry.tag))
    .map((entry) => entry.tag);

  return {
    before,
    after,
    appliedTags,
    durationMs: Date.now() - started,
  };
}
