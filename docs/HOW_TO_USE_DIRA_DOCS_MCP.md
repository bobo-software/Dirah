# Dira Docs MCP

Authenticated Streamable HTTP MCP for markdown docs and folders (the only catalog kinds). This is the **product** MCP for Cursor, Claude Code, and other agents. It is separate from the developer Postgres MCP at `/mcp/protocol`.

## Endpoint

- URL: `{API_PUBLIC_URL}/mcp` (local default `http://localhost:4006/mcp` — use whatever `PORT` your API uses)
- Auth: `Authorization: Bearer dira_mcp_…` (create a token in **Settings**)
- Protocol: MCP JSON-RPC over Streamable HTTP

## Workspace allowlist

Tokens can only see workspaces you enable under Settings → Workspace access. Write also requires an editor/owner membership. (A leftover `encrypted` workspace flag still blocks allowlisting; conversion clears it.)

Allowlist **one** workspace on a PAT used from another git repo. Then omit `workspace` / `workspaceId` on every tool. With more than one allowlisted workspace, pass `workspace` as the slug from `list_workspaces` (e.g. `acme-docs`) or the UUID.

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

Call `dira_guide` once if the client does not surface server instructions. Prefer `search_docs` before inventing APIs or runbooks.

## Tools

| Tool | Purpose |
|------|---------|
| `dira_guide` | How to use this MCP from another repo |
| `list_workspaces` | Allowlisted workspaces (`slug`, `default` when only one) |
| `list_tree` | Paths + kinds; optional `prefix` / `depth` |
| `get_node` | One folder or file by id |
| `read_file` | Read by `path` or `nodeId`; optional `startLine` / `maxLines` |
| `write_file` | Create or replace; `createParents` default true; pass `hash` to avoid clobbering |
| `edit_file` | Replace first `oldString` with `newString` |
| `create_folder` | Create `docs/api` style paths |
| `rename` | Title and/or slug |
| `move` | Reparent via `parentPath` or `parentId` |
| `delete` | Soft-trash (same as the web trash) |
| `search_docs` | Full-text search with snippets + app URLs; omit workspace to search all allowlisted |

Paths look like `docs/api/auth.md`. Folders are path segments; markdown files end in `.md`.

`workspace` / `workspaceId` are optional on every tool. `read_file` / `write_file` / `edit_file` / `search_docs` include a web `url` (`{APP_PUBLIC_URL}/w/:workspaceId/p/:pageId`).

## Safety

- Empty allowlist → no workspaces
- Viewer membership or write checkbox off → read-only
- Leftover encrypted workspaces are rejected (flag is cleared after markdown conversion)
- Markdown PUT is capped at 1MB
- `edit_file` / `write_file` honor content `hash` (409 on mismatch)

OAuth 2.1 “Connect” is supported for clients that implement MCP authorization (see `/.well-known/oauth-protected-resource`). Personal access tokens remain the CI path.
