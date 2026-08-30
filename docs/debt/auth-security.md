# Auth and security

## Refresh token in `localStorage`

[`dira_web/src/auth/AuthContext.tsx`](../../../dira_web/src/auth/AuthContext.tsx) stores `dira.refreshToken` in `localStorage`. XSS can steal it for the full 7-day life. Phase 0 accepted this over httpOnly cookies; move to a `Secure; HttpOnly; SameSite` cookie and CORS `credentials` when we care.

## No rate limit on login/register

`POST /api/auth/login` and `/register` are unlimited. Add a limiter (even a coarse in-memory one in dev) before this is on a network.

## 500 responses leak `error.message`

[`src/middlewares/errorHandler.ts`](../../src/middlewares/errorHandler.ts) passes the raw `Error` into [`ResponseUtils.error`](../../src/utils/ResponseUtils.ts), which puts `err.message` in JSON. That is how “relation does not exist” reached the register form. For status 500, return a generic message and log the rest server-side.

## JWT secrets have in-code defaults

[`src/config/env.ts`](../../src/config/env.ts) falls back to `dev-jwt-secret-change-me`. Fail boot in production if `JWT_SECRET` / `JWT_REFRESH_SECRET` are missing or still the example strings.

## Logout is best-effort

[`src/controllers/auth.controller.ts`](../../src/controllers/auth.controller.ts) returns success even when `refreshToken` is omitted, so the client can look logged out while the token is still valid. Require the token, or revoke all of the user’s refresh rows.

## Dead JWT fields

[`src/utils/jwt.ts`](../../src/utils/jwt.ts) `JwtPayload` has `profileId` and `role`. [`AuthService.issueTokens`](../../src/services/AuthService.ts) only signs `{ userId }`. Drop the extras until a caller needs them, or start putting `role` on the access token for workspace checks.

## Weak verification

`verifyAccessToken` / `verifyRefreshToken` cast with `as JwtPayload` and never check `userId` is a string. A malformed token can throw later as a 500.

## Controllers use `req.user!`

Auth controllers assume middleware ran. Prefer a small helper that 401s if `req.user` is missing, or a typed `AuthedRequest`.
