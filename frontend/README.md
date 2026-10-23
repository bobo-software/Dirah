# Dirah web

React client for [Dirah](https://dirah.co.za), a markdown knowledge base. It talks to the API in [`backend`](../backend): workspaces, a page tree, the editor, sharing, members, MCP tokens, and a separate system-admin console.

Product notes live in the Dirah workspace (`folder/readme.md` or `docs/`), not in this repo.

## Stack

- React 19, TypeScript, Vite 8
- React Router 7
- Zustand stores
- CodeMirror for markdown, `react-markdown` for preview
- Motion for animation

The Docker build needs Node 20.19+ or 22.12+ (the image uses Node 20). Vite inlines `VITE_*` at build time.

## Local setup

Run the API first. See the backend README for Postgres, `.env`, and migrations. From the repo root:

```bash
npm install
cp frontend/.env.example frontend/.env
npm run dev:web
```

`npm run dev` starts the API and the web app together.

The dev server listens on **http://localhost:5181** (`vite.config.ts`, `host: true`).

The browser calls its own origin: Vite proxies `/api` to `http://localhost:4006` (`vite.config.ts`) and nginx does the same in production, so `CORS_ORIGIN` is only needed for the mobile app and other cross-origin clients. `VITE_API_URL` is an optional override for an API on another origin; leave it unset. `VITE_PUBLIC_API_URL` is the API origin shown to users and called by MCP clients (`src/api/client.ts`).

`npm run dev` reads `.env`. `npm run dev:sec` loads Infisical `dev` first. Secret injection is documented in the backend [INFISICAL.md](../backend/INFISICAL.md). This app never imports an Infisical SDK.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite on port 5181 |
| `npm run dev:sec` | Same, with Infisical `dev` |
| `npm run build` | `tsc -b` then `vite build` into `dist/` |
| `npm run build:sec` | Build with Infisical secrets |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

There is no test script in this package. API behaviour is covered by Vitest in `dirah_backend`.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_PUBLIC_API_URL` | A deployed build | API origin used in MCP connector URLs, e.g. `https://api.dirah.co.za`. |
| `VITE_API_URL` | Rarely | Override when the API is on another origin. Unset means this origin. |

That is the only client env var. Auth, OAuth, SMTP, and AI keys stay on the API.

## Routes

Defined in `src/App.tsx`.

| Path | Who | Screen |
| --- | --- | --- |
| `/` | Public | Marketing home, or redirect into the last workspace when signed in |
| `/login`, `/register` | Public | Password auth. Google and GitHub buttons appear when the API reports those providers. |
| `/oauth` | Public | Lands the OAuth redirect and stores the session |
| `/invite/:token` | Public | Preview and accept a workspace invite |
| `/privacy`, `/terms`, `/cookies` | Public | Legal pages |
| `/s/:token` | Public | Shared page, no login |
| `/w/:workspaceId` | Signed in | Workspace shell: sidebar, tree, editor outlet |
| `/w/:workspaceId/p/:pageId` | Signed in | Folder landing or markdown editor |
| `/w/:workspaceId/collection` | Signed in | Favorites and status collection |
| `/w/:workspaceId/trash` | Signed in | Soft-deleted pages |
| `/w/:workspaceId/settings` | Signed in | Members, encryption, MCP tokens granted to this workspace |
| `/w/:workspaceId/settings/mcp/new` | Signed in | Create a docs MCP token for this workspace |
| `/w/:workspaceId/settings/mcp/:tokenId` | Signed in | Token access and rotate |
| `/settings` | Signed in | Account settings: profile, security, every MCP token |
| `/settings/mcp/new` | Signed in | Create a docs MCP token |
| `/settings/mcp/:tokenId` | Signed in | Token access and rotate |
| `/settings/mcp-oauth` | Signed in | Consent screen for MCP OAuth clients |
| `/admin/login` | Public | System-admin login (separate cookie from users) |
| `/admin`, `/admin/users`, `/admin/emails`, `/admin/request-logs` | System admin | Metrics, users, outbound mail, request logs and MCP audit |

Signed-in routes sit under `RequireAuth` and `AppFrame`. Admin routes sit under `RequireSystemAdmin` and `AdminShell`.

## How the client is put together

```
src/
  api/            fetch wrappers. client.ts sets API_URL and the JSON envelope
  pages/          route screens, editor, admin, legal
  components/     sidebar, modals, tables, chrome
  layout/         AppFrame and AdminShell
  stores/data/    Zustand: auth, workspaces, pages, markdown, members, MCP, AI
  stores/state/   editor view (split, preview)
  crypto/         workspace encryption in the browser
  theme/          light and dark, stored as dira.theme
  billing/        plan catalogue shown on the home page
```

`apiRequest` in `src/api/client.ts` sends `credentials: 'include'` and an optional Bearer access token. The API keeps the refresh token in an httpOnly cookie. `useAuthStore.initAuth()` refreshes the session on startup. While the tab stays open, the client refreshes again about a minute before the access token expires, and retries a `401` once after `POST /api/auth/refresh`.

Page nodes are `folder` or `markdown`. Folders hold children. Markdown opens in CodeMirror with a preview. Ask (the copilot panel) calls `POST /api/ai/pages/:id` when the API has `AI_API_KEY` set. The editor works when Ask is off.

Workspace encryption is optional. Enabling it creates a user keypair and wraps a workspace data key. Ciphertext is stored by the API. Unlock happens in `src/crypto/workspaceCrypto.ts`.

Pricing on the home page reads `src/billing/plans.ts`. `BILLING_ENABLED` is `false`: the UI lists plans, only Free can be chosen, and limits are not enforced.

Theme is `light` or `dark` on `document.documentElement` (`data-theme`). `index.html` applies the stored value before React loads so the first paint matches.

## Auth and the API

Typical local pairing:

| App | URL |
| --- | --- |
| This client | `http://localhost:5181` |
| API | `http://localhost:4006` (backend `PORT`; Vite proxies `/api` to it) |

User register and login: `POST /api/auth/register` and `/login`. Session refresh: `POST /api/auth/refresh`. System admin uses `/api/admin/auth/*` and does not share the user cookie.

OAuth start URLs come from `GET /api/auth/oauth/status`. The API redirects back to `/oauth` on this origin.

## Docker

`Dockerfile` builds static files, then nginx serves them. Build from the repo root so the workspace lockfile is available.

- Build arg `VITE_PUBLIC_API_URL` is required for a deploy: the API origin shown to users (MCP connectors). The browser itself calls its own origin; nginx proxies `/api` to `backend:4006` on the compose network. The build script refuses to finish when the arg is missing.
- Alternatively set `INFISICAL_TOKEN`, `INFISICAL_ENV`, and `INFISICAL_DOMAIN` so the build stage loads secrets. A BuildKit secret named `infisical_token` wins over the `INFISICAL_TOKEN` build arg. The nginx stage does not talk to Infisical.
- nginx listens on **port 83**. The healthcheck is `GET http://127.0.0.1:83/health` and returns `ok`.
- `nginx.conf` is an SPA: unknown paths fall through to `index.html`. Static assets (css, js, images, fonts) are cached for six months. `index.html` is sent with `Cache-Control: no-cache`.

```bash
docker build -f frontend/Dockerfile \
  --build-arg VITE_PUBLIC_API_URL=https://api.dirah.co.za \
  -t dirah-web .
```

## Related

- API: [`backend`](../backend)
- Secrets and Coolify: [INFISICAL.md](../backend/INFISICAL.md)
