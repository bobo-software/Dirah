export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4006';

export type PublicUser = {
  id: string;
  email: string;
};

export type PublicWorkspace = {
  id: string;
  name: string;
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
    throw new Error(body.message);
  }
  return body.data as T;
}
