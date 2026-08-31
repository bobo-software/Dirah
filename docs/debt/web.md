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

## BlockSuite 0.19.5

Pinned `@blocksuite/presets`, `blocks`, and `store` at **0.19.5** (last line with `AffineEditorContainer`). Nested `@blocksuite/icons` 2.2 dropped the misspelled `CheckBoxCkeckSolidIcon`; Vite rewrites it in `vite.config.ts`. Prebundle those packages or the editor issues 1000+ unbundled requests. React StrictMode is off: a second mount opened a second IndexedDB provider on the same page key and stacked empty `affine:page` roots.

## Dead auth error state

[`AuthContext.tsx`](../../../dira_web/src/auth/AuthContext.tsx) exposes `error` but only ever `setError(null)`. Pages keep their own `message` state. Remove `error` from context.

## Accessibility

- Error `<p className="error">` has no `role="alert"` on some pages.
- `.visually-hidden` in `index.css` is unused.

## Deploy config (Docker / Coolify)

Web [`Dockerfile`](../../../dira_web/Dockerfile) and [`nginx.conf`](../../../dira_web/nginx.conf) both use port **83**.

`npm ci` in `node:20-alpine` is npm **10**. A lockfile written by npm **12** omitted `react@18.3.1` (BlockSuite icons peer). `package.json` `overrides` pin `react` / `react-dom` to the app versions so `npm ci` matches.

TypeScript 6 DOM types reject `Uint8Array` views as WebCrypto `BufferSource`. Copy through [`src/crypto/bytes.ts`](../../../dira_web/src/crypto/bytes.ts) before `encrypt` / `decrypt` / `importKey`.

Vite bakes `VITE_API_URL` at image build. Coolify has injected a hostname with no scheme; the Dockerfile prefixes `https://` in that case. Prefer setting the Coolify build arg to the full API origin anyway (`https://…`). `.dockerignore` excludes `.env` so the image does not bake local secrets.

API [`Dockerfile`](../../Dockerfile) is Node 26, `EXPOSE 4002`.

## Example PORT vs web

`dira_web` `.env.example` is `VITE_API_URL=http://localhost:4006`. Backend `.env.example` is `PORT=4000`. Align them (see [config.md](./config.md)).
