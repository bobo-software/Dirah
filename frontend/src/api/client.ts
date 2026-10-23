const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_URL = configuredApiUrl || 'http://localhost:4006';

export type PublicUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  about?: string | null;
  hasPassword?: boolean;
};

export type PublicWorkspace = {
  id: string;
  name: string;
  description?: string | null;
  role: string;
  encrypted: boolean;
  mcpEnabled?: boolean;
};

export type PageKind = 'folder' | 'markdown';

export type PublicPage = {
  id: string;
  workspaceId: string;
  title: string;
  parentId: string | null;
  position: number;
  deletedAt: string | null;
  status: string;
  kind: PageKind;
  slug: string | null;
  favorited: boolean;
  createdAt: string;
  excerpt: string;
};

export type NoteVisibility = 'private' | 'workspace';

export type NoteKind = 'note' | 'kanban';

export type PublicNote = {
  id: string;
  workspaceId: string;
  authorId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  cover: string | null;
  visibility: NoteVisibility;
  kind: NoteKind;
  position: number;
  pinnedAt: string | null;
  tagIds: string[];
  editable: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  excerpt: string;
};

export type NoteTag = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
};

export type AuthTokens = {
  accessToken: string;
};

export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiFailure = {
  success: false;
  message: string;
  error?: unknown;
};

/** A failed API call. `code` is the server's machine-readable error (e.g. `HASH_MISMATCH`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseJson(res: Response): Promise<ApiSuccess<unknown> | ApiFailure> {
  return (await res.json()) as ApiSuccess<unknown> | ApiFailure;
}

export type ApiRequestOptions = RequestInit & {
  accessToken?: string;
  skipAuthRetry?: boolean;
  /** Gets a fresh access token after a 401. Defaults to the user session refresh. */
  refresh?: () => Promise<string>;
};

/** Reads `exp` from the JWT payload. The server still verifies the signature. */
export function accessTokenExpiresAt(token: string): number | null {
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (segment.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

let refreshInflight: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const { clearScheduledRefresh, scheduleAccessRefresh, sessionEpochNow, useAuthStore } = await import(
    '../stores/data/authStore'
  );
  const epoch = sessionEpochNow();
  try {
    const { tokens } = await apiRequest<{ tokens: AuthTokens }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
      skipAuthRetry: true,
    });
    if (sessionEpochNow() !== epoch) {
      throw new ApiError('Unauthorized', 401);
    }
    useAuthStore.setState({ accessToken: tokens.accessToken });
    scheduleAccessRefresh(tokens.accessToken);
    return tokens.accessToken;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 401) &&
      sessionEpochNow() === epoch
    ) {
      clearScheduledRefresh();
      useAuthStore.setState({ accessToken: null, user: null });
    }
    throw error;
  }
}

/** One refresh for the tab. The cookie rotates, so a second call in parallel must wait. */
export function refreshAccessToken(): Promise<string> {
  if (refreshInflight) return refreshInflight;
  const job = performRefresh();
  refreshInflight = job;
  return job.finally(() => {
    if (refreshInflight === job) refreshInflight = null;
  });
}

async function apiRequestOnce<T>(path: string, options: ApiRequestOptions): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  delete rest.skipAuthRetry;
  delete rest.refresh;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });
  const body = await parseJson(res);
  if (!body.success) {
    throw new ApiError(body.message, res.status, typeof body.error === 'string' ? body.error : undefined);
  }
  return body.data as T;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  try {
    return await apiRequestOnce(path, options);
  } catch (error) {
    const expired =
      !options.skipAuthRetry &&
      Boolean(options.accessToken) &&
      path !== '/api/auth/refresh' &&
      error instanceof ApiError &&
      error.status === 401;
    if (!expired) throw error;
    const accessToken = await (options.refresh ?? refreshAccessToken)();
    return apiRequestOnce(path, { ...options, accessToken, skipAuthRetry: true });
  }
}
