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

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {}
): Promise<T> {
  const { accessToken, headers, ...rest } = options;
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
