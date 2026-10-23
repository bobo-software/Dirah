import { Parser, type AST } from 'node-sql-parser';

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PARSER_DB = 'PostgreSQL';

const parser = new Parser();

export type ReadStatementKind = 'select';
export type WriteStatementKind =
  | 'insert'
  | 'update'
  | 'delete'
  | 'create'
  | 'alter'
  | 'drop'
  | 'truncate';

export type StatementKind = ReadStatementKind | WriteStatementKind;

export interface GuardedSelect {
  kind: 'select';
  sql: string;
  appliedLimit: number;
}

export interface GuardedWrite {
  kind: WriteStatementKind;
  sql: string;
  requiresDestructive: boolean;
  writeLimit?: number;
}

export interface BulkInsertStatement {
  sql: string;
  values: unknown[];
}

export class SqlGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlGuardError';
  }
}

export function assertValidIdentifier(tableName: string): string {
  if (!IDENTIFIER_RE.test(tableName)) {
    throw new SqlGuardError(
      `Invalid table name "${tableName}". Use letters, numbers, and underscores only.`
    );
  }
  return tableName;
}

export function escapeIdentifier(identifier: string): string {
  const safe = assertValidIdentifier(identifier);
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toPgPlaceholders(sql: string): string {
  let index = 0;
  let result = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      result += ch;
      if (ch === "'" && next === "'") {
        result += next;
        i += 1;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      result += ch;
      if (ch === '"' && next === '"') {
        result += next;
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      result += ch;
      continue;
    }
    if (ch === '?') {
      index += 1;
      result += `$${index}`;
      continue;
    }
    result += ch;
  }

  return result;
}

function normalizeAst(ast: AST | AST[]): AST {
  if (Array.isArray(ast)) {
    if (ast.length !== 1) {
      throw new SqlGuardError('Multi-statement SQL is not allowed');
    }
    return ast[0];
  }
  return ast;
}

function parseSingle(sql: string): AST {
  const trimmed = toPgPlaceholders(sql.trim());
  if (!trimmed) {
    throw new SqlGuardError('SQL is required');
  }
  if (trimmed.includes('\0')) {
    throw new SqlGuardError('SQL contains invalid null bytes');
  }

  let ast: AST | AST[];
  try {
    ast = parser.astify(trimmed, { database: PARSER_DB });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SqlGuardError(`Unable to parse SQL: ${message}`);
  }

  return normalizeAst(ast);
}

function sqlify(ast: AST): string {
  return parser.sqlify(ast, { database: PARSER_DB });
}

function limitFromAst(ast: AST): number | undefined {
  const limit = (ast as { limit?: { value?: Array<{ type?: string; value?: unknown }> } })
    .limit;
  if (!limit?.value?.length) return undefined;

  const numbers = limit.value
    .filter((part) => part.type === 'number')
    .map((part) => Number(part.value));

  if (!numbers.length) return undefined;
  return numbers[numbers.length - 1];
}

function setSelectLimit(ast: AST, limit: number): void {
  (ast as { limit: unknown }).limit = {
    seperator: '',
    value: [{ type: 'number', value: limit }],
  };
}

export function guardSelect(
  sql: string,
  options: { defaultLimit: number; maxLimit: number }
): GuardedSelect {
  const ast = parseSingle(sql);
  const kind = String(ast.type).toLowerCase();
  if (kind !== 'select') {
    throw new SqlGuardError('Only SELECT / WITH statements are allowed for pg_select');
  }

  const existing = limitFromAst(ast);
  let appliedLimit = options.defaultLimit;

  if (existing == null) {
    appliedLimit = options.defaultLimit;
  } else if (!Number.isFinite(existing) || existing <= 0) {
    throw new SqlGuardError('SELECT LIMIT must be a positive integer');
  } else if (existing > options.maxLimit) {
    appliedLimit = options.maxLimit;
  } else {
    appliedLimit = existing;
  }

  setSelectLimit(ast, appliedLimit);

  return {
    kind: 'select',
    sql: sqlify(ast),
    appliedLimit,
  };
}

function firstTableName(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    return assertValidIdentifier(value);
  }
  if (Array.isArray(value)) {
    if (value.length !== 1) return undefined;
    return firstTableName(value[0]);
  }
  if (typeof value === 'object') {
    const rec = value as { table?: unknown };
    if (typeof rec.table === 'string') {
      return assertValidIdentifier(rec.table);
    }
  }
  return undefined;
}

function writeTableName(ast: AST, kind: WriteStatementKind): string {
  const rec = ast as { table?: unknown; from?: unknown };
  const name = firstTableName(rec.table) ?? firstTableName(rec.from);
  if (!name) {
    throw new SqlGuardError(
      `Unable to determine a single table name for ${kind.toUpperCase()}`
    );
  }
  return name;
}

function extractWhereSql(ast: AST): string {
  const where = (ast as { where?: unknown }).where;
  if (!where) {
    throw new SqlGuardError('UPDATE/DELETE statements require a WHERE clause');
  }

  const dummy = {
    type: 'select',
    columns: [{ expr: { type: 'column_ref', table: null, column: '*' }, as: null }],
    from: [{ db: null, table: 't', as: null }],
    where,
  };

  const sql = sqlify(dummy as unknown as AST);
  const match = /\bWHERE\b/i.exec(sql);
  if (!match) {
    throw new SqlGuardError('UPDATE/DELETE statements require a WHERE clause');
  }
  return sql.slice(match.index + match[0].length).trim();
}

function extractSetSql(ast: AST): string {
  const dummy = { ...(ast as object), where: null } as AST;
  const sql = sqlify(dummy);
  const match = /\bSET\b/i.exec(sql);
  if (!match) {
    throw new SqlGuardError('Unable to parse UPDATE SET clause');
  }
  return sql.slice(match.index + match[0].length).trim();
}

function wrapWithCtidLimit(
  kind: 'update' | 'delete',
  ast: AST,
  limit: number
): string {
  const table = writeTableName(ast, kind);
  const quoted = escapeIdentifier(table);
  const whereSql = extractWhereSql(ast);
  const inner = `SELECT ctid FROM ${quoted} WHERE ${whereSql} LIMIT ${limit}`;

  if (kind === 'delete') {
    return `DELETE FROM ${quoted} WHERE ctid IN (${inner})`;
  }

  const setSql = extractSetSql(ast);
  return `UPDATE ${quoted} SET ${setSql} WHERE ctid IN (${inner})`;
}

export function buildBulkInsertStatement(
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  options: { upsert: boolean; conflictTarget?: string[] }
): BulkInsertStatement {
  const safeTable = escapeIdentifier(table);
  const safeColumns = columns.map((column) => escapeIdentifier(column));

  const placeholderRow = `(${columns.map(() => '?').join(', ')})`;
  const placeholders = rows.map(() => placeholderRow).join(', ');

  let sql = `INSERT INTO ${safeTable} (${safeColumns.join(', ')}) VALUES ${placeholders}`;
  if (options.upsert) {
    const targets = options.conflictTarget ?? [];
    if (!targets.length) {
      throw new SqlGuardError('Upsert requires conflictTarget column list');
    }
    targets.forEach((column) => assertValidIdentifier(column));
    const targetSet = new Set(targets);
    const targetSql = targets.map((column) => escapeIdentifier(column)).join(', ');
    const updates = columns
      .filter((column) => !targetSet.has(column))
      .map((column) => {
        const quoted = escapeIdentifier(column);
        return `${quoted} = EXCLUDED.${quoted}`;
      })
      .join(', ');

    if (!updates) {
      sql += ` ON CONFLICT (${targetSql}) DO NOTHING`;
    } else {
      sql += ` ON CONFLICT (${targetSql}) DO UPDATE SET ${updates}`;
    }
  }

  const values: unknown[] = [];
  for (const row of rows) {
    for (const column of columns) {
      values.push(row[column]);
    }
  }

  return { sql, values };
}

export function guardWrite(
  sql: string,
  options: {
    confirm: boolean;
    allowDestructive: boolean;
    maxWriteLimit: number;
  }
): GuardedWrite {
  if (!options.confirm) {
    throw new SqlGuardError('Writes require confirm: true');
  }

  const ast = parseSingle(sql);
  const kind = String(ast.type).toLowerCase() as WriteStatementKind;
  const allowed: WriteStatementKind[] = [
    'insert',
    'update',
    'delete',
    'create',
    'alter',
    'drop',
    'truncate',
  ];

  if (!allowed.includes(kind)) {
    throw new SqlGuardError(
      `Unsupported write statement type "${kind}". Allowed: ${allowed.join(', ')}`
    );
  }

  const requiresDestructive = kind === 'drop' || kind === 'truncate';
  if (requiresDestructive && !options.allowDestructive) {
    throw new SqlGuardError(
      `${kind.toUpperCase()} requires allowDestructive: true`
    );
  }

  if (kind === 'update' || kind === 'delete') {
    if (!(ast as { where?: unknown }).where) {
      throw new SqlGuardError(
        `${kind.toUpperCase()} statements require a WHERE clause`
      );
    }

    const existing = limitFromAst(ast);
    let writeLimit = options.maxWriteLimit;
    if (existing != null) {
      if (!Number.isFinite(existing) || existing <= 0) {
        throw new SqlGuardError(`${kind.toUpperCase()} LIMIT must be a positive integer`);
      }
      if (existing > options.maxWriteLimit) {
        throw new SqlGuardError(
          `${kind.toUpperCase()} LIMIT ${existing} exceeds max write limit ${options.maxWriteLimit}`
        );
      }
      writeLimit = existing;
    }

    return {
      kind,
      sql: wrapWithCtidLimit(kind, ast, writeLimit),
      requiresDestructive,
      writeLimit,
    };
  }

  return {
    kind,
    sql: sqlify(ast),
    requiresDestructive,
  };
}
