import { and, count, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { emailLogs, mcpAudit, pages, requestLogs, users, workspaces } from '../db/schemas';

export type Database = typeof db;

export interface AdminMetrics {
  users: number;
  workspaces: number;
  pages: number;
  requestLogs24h: number;
  emails24h: number;
  errorRate24h: number;
}

export interface TimeBucket {
  bucket: string;
  total: number;
  errors: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface RequestAnalytics {
  windowHours: number;
  api: {
    total: number;
    errors: number;
    avgDurationMs: number;
    byHour: TimeBucket[];
    byMethod: NamedCount[];
    byStatus: NamedCount[];
  };
  mcp: {
    total: number;
    byHour: TimeBucket[];
    byTool: NamedCount[];
    byOutcome: NamedCount[];
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class AdminService {
  constructor(private readonly database: Database) {}

  async metrics(): Promise<AdminMetrics> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [[usersRow], [workspacesRow], [pagesRow], [logsRow], [emailsRow], [errorsRow]] =
      await Promise.all([
        this.database.select({ value: count() }).from(users),
        this.database.select({ value: count() }).from(workspaces).where(isNull(workspaces.deletedAt)),
        this.database.select({ value: count() }).from(pages),
        this.database
          .select({ value: count() })
          .from(requestLogs)
          .where(gte(requestLogs.createdAt, since)),
        this.database
          .select({ value: count() })
          .from(emailLogs)
          .where(gte(emailLogs.createdAt, since)),
        this.database
          .select({ value: count() })
          .from(requestLogs)
          .where(and(gte(requestLogs.createdAt, since), eq(requestLogs.success, false))),
      ]);

    const requestLogs24h = Number(logsRow.value);
    const errors24h = Number(errorsRow.value);

    return {
      users: Number(usersRow.value),
      workspaces: Number(workspacesRow.value),
      pages: Number(pagesRow.value),
      requestLogs24h,
      emails24h: Number(emailsRow.value),
      errorRate24h: requestLogs24h === 0 ? 0 : errors24h / requestLogs24h,
    };
  }

  async requestAnalytics(windowHours = 24): Promise<RequestAnalytics> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const [
      [apiTotals],
      apiByHour,
      apiByMethod,
      apiByStatus,
      [mcpTotal],
      mcpByHour,
      mcpByTool,
      mcpByOutcome,
    ] = await Promise.all([
      this.database
        .select({
          total: count(),
          errors: sql<number>`count(*) filter (where ${requestLogs.success} = false)`,
          avgDurationMs: sql<number>`coalesce(avg(${requestLogs.durationMs}), 0)`,
        })
        .from(requestLogs)
        .where(gte(requestLogs.createdAt, since)),
      this.database
        .select({
          bucket: sql<string>`to_char(date_trunc('hour', ${requestLogs.createdAt}), 'YYYY-MM-DD"T"HH24:00:00Z')`,
          total: count(),
          errors: sql<number>`count(*) filter (where ${requestLogs.success} = false)`,
        })
        .from(requestLogs)
        .where(gte(requestLogs.createdAt, since))
        .groupBy(sql`date_trunc('hour', ${requestLogs.createdAt})`)
        .orderBy(sql`date_trunc('hour', ${requestLogs.createdAt})`),
      this.database
        .select({
          name: requestLogs.method,
          count: count(),
        })
        .from(requestLogs)
        .where(gte(requestLogs.createdAt, since))
        .groupBy(requestLogs.method)
        .orderBy(desc(count())),
      this.database
        .select({
          name: sql<string>`${requestLogs.statusCode}::text`,
          count: count(),
        })
        .from(requestLogs)
        .where(gte(requestLogs.createdAt, since))
        .groupBy(requestLogs.statusCode)
        .orderBy(desc(count())),
      this.database
        .select({ value: count() })
        .from(mcpAudit)
        .where(gte(mcpAudit.createdAt, since)),
      this.database
        .select({
          bucket: sql<string>`to_char(date_trunc('hour', ${mcpAudit.createdAt}), 'YYYY-MM-DD"T"HH24:00:00Z')`,
          total: count(),
          errors: sql<number>`count(*) filter (where ${mcpAudit.outcome} <> 'ok' and ${mcpAudit.outcome} <> 'success')`,
        })
        .from(mcpAudit)
        .where(gte(mcpAudit.createdAt, since))
        .groupBy(sql`date_trunc('hour', ${mcpAudit.createdAt})`)
        .orderBy(sql`date_trunc('hour', ${mcpAudit.createdAt})`),
      this.database
        .select({
          name: mcpAudit.tool,
          count: count(),
        })
        .from(mcpAudit)
        .where(gte(mcpAudit.createdAt, since))
        .groupBy(mcpAudit.tool)
        .orderBy(desc(count()))
        .limit(12),
      this.database
        .select({
          name: mcpAudit.outcome,
          count: count(),
        })
        .from(mcpAudit)
        .where(gte(mcpAudit.createdAt, since))
        .groupBy(mcpAudit.outcome)
        .orderBy(desc(count())),
    ]);

    return {
      windowHours,
      api: {
        total: Number(apiTotals.total),
        errors: Number(apiTotals.errors),
        avgDurationMs: Math.round(Number(apiTotals.avgDurationMs)),
        byHour: apiByHour.map((row) => ({
          bucket: row.bucket,
          total: Number(row.total),
          errors: Number(row.errors),
        })),
        byMethod: apiByMethod.map((row) => ({
          name: row.name,
          count: Number(row.count),
        })),
        byStatus: apiByStatus.map((row) => ({
          name: row.name,
          count: Number(row.count),
        })),
      },
      mcp: {
        total: Number(mcpTotal.value),
        byHour: mcpByHour.map((row) => ({
          bucket: row.bucket,
          total: Number(row.total),
          errors: Number(row.errors),
        })),
        byTool: mcpByTool.map((row) => ({
          name: row.name,
          count: Number(row.count),
        })),
        byOutcome: mcpByOutcome.map((row) => ({
          name: row.name,
          count: Number(row.count),
        })),
      },
    };
  }

  async listUsers(page: number, pageSize: number): Promise<
    PaginatedResult<{ id: string; email: string; createdAt: Date }>
  > {
    const offset = (page - 1) * pageSize;
    const [totalRow] = await this.database.select({ value: count() }).from(users);
    const items = await this.database
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items,
      total: Number(totalRow.value),
      page,
      pageSize,
    };
  }

  async listEmails(
    page: number,
    pageSize: number
  ): Promise<
    PaginatedResult<{
      id: string;
      to: string;
      subject: string;
      kind: string;
      success: boolean;
      error: string | null;
      meta: unknown;
      createdAt: Date;
    }>
  > {
    const offset = (page - 1) * pageSize;
    const [totalRow] = await this.database.select({ value: count() }).from(emailLogs);
    const items = await this.database
      .select({
        id: emailLogs.id,
        to: emailLogs.to,
        subject: emailLogs.subject,
        kind: emailLogs.kind,
        success: emailLogs.success,
        error: emailLogs.error,
        meta: emailLogs.meta,
        createdAt: emailLogs.createdAt,
      })
      .from(emailLogs)
      .orderBy(desc(emailLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items,
      total: Number(totalRow.value),
      page,
      pageSize,
    };
  }

  async listRequestLogs(
    page: number,
    pageSize: number,
    filters: {
      success?: boolean;
      statusCode?: number;
      method?: string;
      from?: Date;
      to?: Date;
    }
  ): Promise<
    PaginatedResult<{
      id: string;
      method: string;
      url: string;
      statusCode: number;
      durationMs: number;
      success: boolean;
      message: string;
      userId: string | null;
      userRole: string | null;
      ip: string | null;
      requestBody: unknown;
      responseBody: unknown;
      createdAt: Date;
    }>
  > {
    const conditions: SQL[] = [];
    if (filters.success !== undefined) {
      conditions.push(eq(requestLogs.success, filters.success));
    }
    if (filters.statusCode !== undefined) {
      conditions.push(eq(requestLogs.statusCode, filters.statusCode));
    }
    if (filters.method) {
      conditions.push(eq(requestLogs.method, filters.method.toUpperCase()));
    }
    if (filters.from) {
      conditions.push(gte(requestLogs.createdAt, filters.from));
    }
    if (filters.to) {
      conditions.push(lte(requestLogs.createdAt, filters.to));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [totalRow] = await this.database
      .select({ value: count() })
      .from(requestLogs)
      .where(where);

    const items = await this.database
      .select({
        id: requestLogs.id,
        method: requestLogs.method,
        url: requestLogs.url,
        statusCode: requestLogs.statusCode,
        durationMs: requestLogs.durationMs,
        success: requestLogs.success,
        message: requestLogs.message,
        userId: requestLogs.userId,
        userRole: requestLogs.userRole,
        ip: requestLogs.ip,
        requestBody: requestLogs.requestBody,
        responseBody: requestLogs.responseBody,
        createdAt: requestLogs.createdAt,
      })
      .from(requestLogs)
      .where(where)
      .orderBy(desc(requestLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items,
      total: Number(totalRow.value),
      page,
      pageSize,
    };
  }

  async listMcpAudit(
    page: number,
    pageSize: number,
    filters: { tool?: string; outcome?: string } = {}
  ): Promise<
    PaginatedResult<{
      id: string;
      userId: string | null;
      workspaceId: string | null;
      tokenId: string | null;
      tool: string;
      nodeId: string | null;
      outcome: string;
      createdAt: Date;
    }>
  > {
    const conditions: SQL[] = [];
    if (filters.tool) conditions.push(eq(mcpAudit.tool, filters.tool));
    if (filters.outcome) conditions.push(eq(mcpAudit.outcome, filters.outcome));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [totalRow] = await this.database.select({ value: count() }).from(mcpAudit).where(where);
    const items = await this.database
      .select({
        id: mcpAudit.id,
        userId: mcpAudit.userId,
        workspaceId: mcpAudit.workspaceId,
        tokenId: mcpAudit.tokenId,
        tool: mcpAudit.tool,
        nodeId: mcpAudit.nodeId,
        outcome: mcpAudit.outcome,
        createdAt: mcpAudit.createdAt,
      })
      .from(mcpAudit)
      .where(where)
      .orderBy(desc(mcpAudit.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items,
      total: Number(totalRow.value),
      page,
      pageSize,
    };
  }
}
