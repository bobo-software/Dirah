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

## Deploy config (Docker)

`Dockerfile` `EXPOSE 82` vs `nginx.conf` `listen 83` — containers and the published port will not agree.

## Example PORT vs web

`dira_web` `.env.example` is `VITE_API_URL=http://localhost:4006`. Backend `.env.example` is `PORT=4000`. Align them (see [config.md](./config.md)).
