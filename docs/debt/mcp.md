# MCP client configs

Cursor/Claude will not hit the running API unless URL and `MCP_API_KEY` match.

| File | URL port | Auth |
|------|----------|------|
| [`.mcp.json`](../../.mcp.json) | **4000** | `${env:MCP_API_KEY}` |
| [`cursor/mcp.json`](../../cursor/mcp.json) | **4006** | `${env:MCP_API_KEY}` |
| [`.cursor/mcp.json`](../../.cursor/mcp.json) | **4006** | hardcoded `dev-mcp-key-change-in-production` |

Local API listens on **4006** (`.env` `PORT`). Keep one port everywhere, or document that `.mcp.json` is the “example default 4000” copy.

Hardcoding the Bearer token in `.cursor/mcp.json` works around Cursor not loading project `.env`, but the file is gitignored (good) and will rot if `MCP_API_KEY` changes.

[`docs/HOW_TO_BUILD_AN_MCP_SERVER.md`](../HOW_TO_BUILD_AN_MCP_SERVER.md) still shows port 4000 in curl examples.
