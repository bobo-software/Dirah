import { describe, expect, it } from 'vitest';
import {
  SqlGuardError,
  assertValidIdentifier,
  buildBulkInsertStatement,
  escapeIdentifier,
  guardSelect,
  guardWrite,
  toPgPlaceholders,
} from './sqlGuards';

describe('sqlGuards', () => {
  describe('identifiers', () => {
    it('accepts valid identifiers and escapes them', () => {
      expect(assertValidIdentifier('users')).toBe('users');
      expect(escapeIdentifier('users')).toBe('"users"');
    });

    it('rejects invalid identifiers', () => {
      expect(() => assertValidIdentifier('users; drop')).toThrow(SqlGuardError);
      expect(() => assertValidIdentifier('a.b')).toThrow(SqlGuardError);
    });
  });

  describe('toPgPlaceholders', () => {
    it('converts ? placeholders to $n', () => {
      expect(toPgPlaceholders('SELECT * FROM users WHERE id = ? AND name = ?')).toBe(
        'SELECT * FROM users WHERE id = $1 AND name = $2'
      );
    });

    it('does not replace ? inside string literals', () => {
      expect(toPgPlaceholders("SELECT '?' FROM users WHERE id = ?")).toBe(
        "SELECT '?' FROM users WHERE id = $1"
      );
    });
  });

  describe('guardSelect', () => {
    it('allows SELECT and applies default limit', () => {
      const result = guardSelect('SELECT id FROM users', {
        defaultLimit: 100,
        maxLimit: 1000,
      });
      expect(result.kind).toBe('select');
      expect(result.appliedLimit).toBe(100);
      expect(result.sql.toUpperCase()).toContain('LIMIT 100');
    });

    it('allows WITH/CTE selects', () => {
      const result = guardSelect(
        'WITH cte AS (SELECT 1 AS x) SELECT * FROM cte',
        { defaultLimit: 50, maxLimit: 1000 }
      );
      expect(result.kind).toBe('select');
      expect(result.appliedLimit).toBe(50);
    });

    it('clamps oversized SELECT limits', () => {
      const result = guardSelect('SELECT * FROM users LIMIT 9999', {
        defaultLimit: 100,
        maxLimit: 1000,
      });
      expect(result.appliedLimit).toBe(1000);
      expect(result.sql.toUpperCase()).toContain('LIMIT 1000');
    });

    it('rejects multi-statement SQL', () => {
      expect(() =>
        guardSelect('SELECT 1; SELECT 2', { defaultLimit: 10, maxLimit: 100 })
      ).toThrow(/Multi-statement/);
    });

    it('rejects non-select statements', () => {
      expect(() =>
        guardSelect('DELETE FROM users WHERE id = 1', {
          defaultLimit: 10,
          maxLimit: 100,
        })
      ).toThrow(/Only SELECT/);
    });

    it('converts ? placeholders to $n for Postgres', () => {
      const result = guardSelect('SELECT * FROM users WHERE id = ?', {
        defaultLimit: 25,
        maxLimit: 100,
      });
      expect(result.sql).toContain('$1');
      expect(result.sql).not.toContain('?');
    });
  });

  describe('guardWrite', () => {
    it('requires confirm', () => {
      expect(() =>
        guardWrite('INSERT INTO users (id) VALUES (1)', {
          confirm: false,
          allowDestructive: false,
          maxWriteLimit: 100,
        })
      ).toThrow(/confirm: true/);
    });

    it('allows confirmed insert', () => {
      const result = guardWrite('INSERT INTO users (id) VALUES (1)', {
        confirm: true,
        allowDestructive: false,
        maxWriteLimit: 100,
      });
      expect(result.kind).toBe('insert');
    });

    it('requires WHERE on update/delete and wraps with ctid limit', () => {
      expect(() =>
        guardWrite('UPDATE users SET name = ?', {
          confirm: true,
          allowDestructive: false,
          maxWriteLimit: 100,
        })
      ).toThrow(/WHERE/);

      expect(() =>
        guardWrite('DELETE FROM users', {
          confirm: true,
          allowDestructive: false,
          maxWriteLimit: 100,
        })
      ).toThrow(/WHERE/);

      const ok = guardWrite('DELETE FROM users WHERE id = 1', {
        confirm: true,
        allowDestructive: false,
        maxWriteLimit: 1000,
      });
      expect(ok.kind).toBe('delete');
      expect(ok.writeLimit).toBe(1000);
      expect(ok.sql.toLowerCase()).toContain('ctid');
      expect(ok.sql.toUpperCase()).toContain('LIMIT 1000');
    });

    it('wraps UPDATE SET with a ctid subquery', () => {
      const result = guardWrite("UPDATE users SET name = 'x' WHERE id = 1", {
        confirm: true,
        allowDestructive: false,
        maxWriteLimit: 50,
      });
      expect(result.kind).toBe('update');
      expect(result.sql.toLowerCase()).toContain('ctid');
      expect(result.sql.toUpperCase()).toContain('LIMIT 50');
      expect(result.sql).toMatch(/SET/i);
    });

    it('requires allowDestructive for drop/truncate', () => {
      expect(() =>
        guardWrite('DROP TABLE users', {
          confirm: true,
          allowDestructive: false,
          maxWriteLimit: 100,
        })
      ).toThrow(/allowDestructive/);

      const ok = guardWrite('TRUNCATE TABLE users', {
        confirm: true,
        allowDestructive: true,
        maxWriteLimit: 100,
      });
      expect(ok.kind).toBe('truncate');
      expect(ok.requiresDestructive).toBe(true);
    });

    it('rejects multi-statement writes', () => {
      expect(() =>
        guardWrite('INSERT INTO users (id) VALUES (1); DROP TABLE users', {
          confirm: true,
          allowDestructive: true,
          maxWriteLimit: 100,
        })
      ).toThrow(/Multi-statement|Unable to parse|Unsupported/);
    });
  });

  describe('buildBulkInsertStatement', () => {
    it('builds a parameterized INSERT', () => {
      const result = buildBulkInsertStatement(
        'users',
        ['id', 'name'],
        [
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
        ],
        { upsert: false }
      );
      expect(result.sql).toContain('INSERT INTO "users"');
      expect(result.sql).toContain('?');
      expect(result.values).toEqual([1, 'a', 2, 'b']);
    });

    it('requires conflictTarget for upsert', () => {
      expect(() =>
        buildBulkInsertStatement('users', ['id', 'name'], [{ id: 1, name: 'a' }], {
          upsert: true,
        })
      ).toThrow(/conflictTarget/);
    });

    it('builds ON CONFLICT DO UPDATE', () => {
      const result = buildBulkInsertStatement(
        'users',
        ['id', 'name'],
        [{ id: 1, name: 'a' }],
        { upsert: true, conflictTarget: ['id'] }
      );
      expect(result.sql).toContain('ON CONFLICT ("id")');
      expect(result.sql).toContain('EXCLUDED."name"');
    });
  });
});
