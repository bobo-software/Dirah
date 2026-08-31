# Web (`dira_web`)

## Vite starter leftovers

Unused after the Phase 0 shell:

- `src/App.css`
- `src/assets/hero.png`, `react.svg`, `vite.svg`
- `public/icons.svg` (favicon is still used)
- Stock `README.md`
- `tailwind.config.js` with no Tailwind dependency
- Empty `src/stores/StoresIndex.ts` and empty `src/backend`, `components`, `hooks`, `types`, `utils` dirs

Delete when you next touch the frontend.

## Auth UX bugs

Register now lands on `/w/:id`. Login uses `location.state.from` after submit.

## Dead auth error state

[`AuthContext.tsx`](../../../dira_web/src/auth/AuthContext.tsx) exposes `error` but only ever `setError(null)`. Pages keep their own `message` state. Remove `error` from context.

## Accessibility

- Error `<p className="error">` has no `role="alert"` on some pages.
- `.visually-hidden` in `index.css` is unused.

## Deploy config (Docker / Coolify)

Web [`Dockerfile`](../../../dira_web/Dockerfile) and [`nginx.conf`](../../../dira_web/nginx.conf) both use port **83**.

Vite bakes `VITE_API_URL` at image build. Coolify has injected a hostname with no scheme; the Dockerfile prefixes `https://` in that case. Prefer setting the Coolify build arg to the full API origin anyway (`https://…`). `.dockerignore` excludes `.env` so the image does not bake local secrets.

API [`Dockerfile`](../../Dockerfile) is Node 26, `EXPOSE 4002`.

## Example PORT vs web

`dira_web` `.env.example` is `VITE_API_URL=http://localhost:4006`. Backend `.env.example` is `PORT=4000`. Align them (see [config.md](./config.md)).
