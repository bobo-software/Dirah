# Dira Docs MCP

Authenticated Streamable HTTP MCP for markdown docs and folders. This is the **product** MCP for Cursor, Claude Code, and other agents. It is separate from the developer Postgres MCP at `/mcp/protocol`.

## Endpoint

- URL: `{API_PUBLIC_URL}/mcp` (local default `http://localhost:4006/mcp` — use whatever `PORT` your API uses)
- Auth: `Authorization: Bearer dira_mcp_…` (create a token in **Settings**)
- Protocol: MCP JSON-RPC over Streamable HTTP

## Workspace allowlist

Tokens can only see workspaces you enable under Settings → Workspace access. Encrypted workspaces cannot be allowlisted. Write also requires an editor/owner membership.

## Cursor / Claude Code

Create a token in the Dira web app, then:

```json
{
  "mcpServers": {
    "dira": {
      "url": "https://<your-api>/mcp",
      "headers": {
        "Authorization": "Bearer dira_mcp_…"
      }
    }
  }
}
```

Claude Code: same URL and Bearer header in `.mcp.json` or `claude mcp add --transport http`.

## Tools

| Tool | Purpose |
|------|---------|
| `list_workspaces` | Allowlisted workspaces |
| `list_tree` | Markdown files and folders (BlockSuite pages omitted) |
| `get_node` | One folder or file by id |
| `read_file` | Read markdown by `path` or `nodeId` |
| `write_file` | Create or replace; `createParents` default true; pass `hash` to avoid clobbering |
| `edit_file` | Replace first `oldString` with `newString` |
| `create_folder` | Create `docs/api` style paths |
| `rename` | Title and/or slug |
| `move` | Reparent via `parentPath` or `parentId` |
| `delete` | Soft-trash (same as the web trash) |
| `search_docs` | Full-text search over markdown |

Paths look like `docs/api/auth.md`. Folders are path segments; markdown files end in `.md`.

## Safety

- Empty allowlist → no workspaces
- Viewer membership or write checkbox off → read-only
- Encrypted workspaces are rejected
- Markdown PUT is capped at 1MB
- `edit_file` / `write_file` honor content `hash` (409 on mismatch)

OAuth 2.1 “Connect” is supported for clients that implement MCP authorization (see `/.well-known/oauth-protected-resource`). Personal access tokens remain the CI path.
