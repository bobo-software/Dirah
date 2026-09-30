import { apiRequest, type AuthTokens } from './client';

export type PublicSystemAdmin = {
  id: string;
  email: string;
};

export type AdminMetrics = {
  users: number;
  workspaces: number;
  pages: number;
  requestLogs24h: number;
  emails24h: number;
  errorRate24h: number;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
};

export type AdminEmailRow = {
  id: string;
  to: string;
  subject: string;
  kind: string;
  success: boolean;
  error: string | null;
  meta: unknown;
  createdAt: string;
};

export type AdminRequestLogRow = {
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
  createdAt: string;
};

export type AdminMcpAuditRow = {
  id: string;
  userId: string | null;
  workspaceId: string | null;
  tokenId: string | null;
  tool: string;
  nodeId: string | null;
  outcome: string;
  createdAt: string;
};

export type RequestAnalytics = {
  windowHours: number;
  api: {
    total: number;
    errors: number;
    avgDurationMs: number;
    byHour: { bucket: string; total: number; errors: number }[];
    byMethod: { name: string; count: number }[];
    byStatus: { name: string; count: number }[];
  };
  mcp: {
    total: number;
    byHour: { bucket: string; total: number; errors: number }[];
    byTool: { name: string; count: number }[];
    byOutcome: { name: string; count: number }[];
  };
};

export async function adminLogin(email: string, password: string) {
  return apiRequest<{ admin: PublicSystemAdmin; tokens: AuthTokens }>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function adminRefresh(legacyRefreshToken?: string) {
  return apiRequest<{ tokens: AuthTokens }>('/api/admin/auth/refresh', {
    method: 'POST',
    body: JSON.stringify(legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}),
  });
}

export async function adminLogout() {
  return apiRequest('/api/admin/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function adminMe(accessToken: string) {
  return apiRequest<{ admin: PublicSystemAdmin }>('/api/admin/auth/me', { accessToken });
}

export async function fetchAdminMetrics(accessToken: string) {
  return apiRequest<{ metrics: AdminMetrics }>('/api/admin/metrics', { accessToken });
}

export async function fetchAdminUsers(accessToken: string, page = 1, pageSize = 25) {
  return apiRequest<Paginated<AdminUserRow>>(
    `/api/admin/users?page=${page}&pageSize=${pageSize}`,
    { accessToken }
  );
}

export async function fetchAdminEmails(accessToken: string, page = 1, pageSize = 25) {
  return apiRequest<Paginated<AdminEmailRow>>(
    `/api/admin/emails?page=${page}&pageSize=${pageSize}`,
    { accessToken }
  );
}

export async function fetchAdminRequestLogs(
  accessToken: string,
  page = 1,
  pageSize = 25,
  filters: { success?: boolean; statusCode?: number; method?: string } = {}
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (filters.success !== undefined) params.set('success', String(filters.success));
  if (filters.statusCode !== undefined) params.set('statusCode', String(filters.statusCode));
  if (filters.method) params.set('method', filters.method);
  return apiRequest<Paginated<AdminRequestLogRow>>(`/api/admin/request-logs?${params}`, {
    accessToken,
  });
}

export async function fetchAdminRequestAnalytics(accessToken: string, hours = 24) {
  return apiRequest<{ analytics: RequestAnalytics }>(
    `/api/admin/request-logs/analytics?hours=${hours}`,
    { accessToken }
  );
}

export async function fetchAdminMcpAudit(
  accessToken: string,
  page = 1,
  pageSize = 25,
  filters: { tool?: string; outcome?: string } = {}
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (filters.tool) params.set('tool', filters.tool);
  if (filters.outcome) params.set('outcome', filters.outcome);
  return apiRequest<Paginated<AdminMcpAuditRow>>(`/api/admin/mcp-audit?${params}`, {
    accessToken,
  });
}
