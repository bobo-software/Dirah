import { randomUUID } from 'crypto';
import { HttpError } from './HttpError';

export const INTERNAL_ERROR = 'INTERNAL_ERROR';

export interface PublicError {
  status: number;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  /** Only set for unexpected failures; the real error is logged under this id. */
  requestId?: string;
}

/**
 * What a client may see of a failure. `HttpError`s and framework 4xx errors keep their message;
 * anything else is hidden behind INTERNAL_ERROR, because its message can carry SQL and schema names.
 */
export function toPublicError(error: unknown): PublicError {
  if (error instanceof HttpError) {
    return { status: error.status, message: error.message, code: error.code, details: error.details };
  }

  const candidate = error as { status?: unknown; type?: unknown; message?: unknown } | null;
  const status = typeof candidate?.status === 'number' ? candidate.status : 500;
  if (status >= 400 && status < 500) {
    const message = typeof candidate?.message === 'string' ? candidate.message : 'Bad request';
    const code = typeof candidate?.type === 'string' ? candidate.type : message;
    return { status, message, code };
  }

  const requestId = randomUUID();
  console.error(`[error ${requestId}]`, error);
  return { status: 500, message: 'Internal server error', code: INTERNAL_ERROR, requestId };
}

/** The `{ message, code, details }` an MCP tool reports; the request id rides in `details`. */
export function toolError(error: unknown): { message: string; code?: string; details?: Record<string, unknown> } {
  const { message, code, details, requestId } = toPublicError(error);
  return { message, code, details: requestId ? { ...details, requestId } : details };
}
