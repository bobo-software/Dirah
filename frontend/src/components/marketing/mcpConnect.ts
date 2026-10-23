import { API_URL } from '../../api/client';

export const MCP_URL = `${API_URL.replace(/\/$/, '')}/mcp`;

export const CLAUDE_CODE_COMMAND = `claude mcp add --transport http dirah ${MCP_URL}`;

export const CURSOR_CONFIG = JSON.stringify({ mcpServers: { dirah: { url: MCP_URL } } }, null, 2);

/* Cursor's install link takes the server's config as base64 JSON. */
export const CURSOR_INSTALL_URL = `cursor://anysphere.cursor-deeplink/mcp/install?name=dirah&config=${encodeURIComponent(
  btoa(JSON.stringify({ url: MCP_URL })),
)}`;
