import { AsyncLocalStorage } from 'node:async_hooks';
import type { ResolvedMcpAuth } from '../../services/McpTokenService';

export const docsMcpAuth = new AsyncLocalStorage<ResolvedMcpAuth>();

export function currentDocsAuth(): ResolvedMcpAuth {
  const auth = docsMcpAuth.getStore();
  if (!auth) {
    throw new Error('MCP auth context missing');
  }
  return auth;
}
