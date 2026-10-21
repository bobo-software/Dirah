import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MINUTE = 60_000;
const START = new Date('2026-10-21T12:00:00Z').getTime();

/** An unsigned JWT; the client only reads `exp`. */
function fakeJwt(label: string, expiresInMs = 15 * MINUTE): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'none' })}.${encode({ sub: label, exp: Math.floor((Date.now() + expiresInMs) / 1000) })}.sig`;
}

type Route = (init: RequestInit) => { status: number; body: unknown };

function ok(data: unknown) {
  return { status: 200, body: { success: true, message: 'ok', data } };
}

function unauthorized() {
  return { status: 401, body: { success: false, message: 'Unauthorized', error: 'UNAUTHORIZED' } };
}

const admin = { id: 'admin-1', email: 'admin@example.com' };
const user = { id: 'user-1', email: 'user@example.com' };

describe('admin session refresh', () => {
  let routes: Record<string, Route>;
  let calls: { path: string; auth: string | undefined }[];

  async function load() {
    vi.resetModules();
    const adminStore = await import('./adminAuthStore');
    const userStore = await import('./authStore');
    const adminApi = await import('../../api/admin');
    userStore.useAuthStore.setState({ user, accessToken: 'user-token' });
    return { ...adminStore, ...userStore, ...adminApi };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    calls = [];
    routes = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = new URL(url).pathname;
        const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
        calls.push({ path, auth });
        const route = routes[path];
        const { status, body } = route ? route(init) : { status: 404, body: { success: false, message: 'Not found' } };
        return { status, json: async () => body };
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes the admin token before it expires, through the admin endpoint only', async () => {
    const { useAdminAuthStore, useAuthStore } = await load();
    const first = fakeJwt('admin-a');
    const second = fakeJwt('admin-b', 29 * MINUTE);
    routes['/api/admin/auth/login'] = () => ok({ admin, tokens: { accessToken: first } });
    routes['/api/admin/auth/me'] = () => ok({ admin });
    routes['/api/admin/auth/refresh'] = () => ok({ tokens: { accessToken: second } });

    await useAdminAuthStore.getState().login(admin.email, 'password12');
    expect(useAdminAuthStore.getState().accessToken).toBe(first);

    await vi.advanceTimersByTimeAsync(13 * MINUTE);
    expect(calls.some((call) => call.path === '/api/admin/auth/refresh')).toBe(false);

    await vi.advanceTimersByTimeAsync(1 * MINUTE + 1_000);
    expect(useAdminAuthStore.getState().accessToken).toBe(second);
    expect(calls.map((call) => call.path)).not.toContain('/api/auth/refresh');
    expect(useAuthStore.getState()).toMatchObject({ user, accessToken: 'user-token' });
  });

  it('retries an expired admin call with a refreshed admin token', async () => {
    const { useAdminAuthStore, useAuthStore, fetchAdminMetrics } = await load();
    const stale = fakeJwt('admin-stale');
    const fresh = fakeJwt('admin-fresh');
    useAdminAuthStore.setState({ admin, accessToken: stale });
    routes['/api/admin/metrics'] = (init) =>
      (init.headers as Record<string, string>).Authorization === `Bearer ${fresh}`
        ? ok({ metrics: { users: 3 } })
        : unauthorized();
    routes['/api/admin/auth/refresh'] = () => ok({ tokens: { accessToken: fresh } });

    const { metrics } = await fetchAdminMetrics(stale);

    expect(metrics).toEqual({ users: 3 });
    expect(calls.map((call) => call.path)).toEqual([
      '/api/admin/metrics',
      '/api/admin/auth/refresh',
      '/api/admin/metrics',
    ]);
    expect(useAdminAuthStore.getState().accessToken).toBe(fresh);
    expect(useAuthStore.getState()).toMatchObject({ user, accessToken: 'user-token' });
  });

  it('signs the admin out, and leaves the user session alone, when the admin refresh is rejected', async () => {
    const { useAdminAuthStore, useAuthStore, fetchAdminMetrics } = await load();
    const stale = fakeJwt('admin-stale');
    useAdminAuthStore.setState({ admin, accessToken: stale });
    routes['/api/admin/metrics'] = () => unauthorized();
    routes['/api/admin/auth/refresh'] = () => unauthorized();

    await expect(fetchAdminMetrics(stale)).rejects.toMatchObject({ status: 401 });

    expect(useAdminAuthStore.getState()).toMatchObject({ admin: null, accessToken: null });
    expect(useAuthStore.getState()).toMatchObject({ user, accessToken: 'user-token' });
    expect(calls.map((call) => call.path)).not.toContain('/api/auth/refresh');
  });

  it('stops refreshing after logout', async () => {
    const { useAdminAuthStore } = await load();
    routes['/api/admin/auth/login'] = () => ok({ admin, tokens: { accessToken: fakeJwt('admin-a') } });
    routes['/api/admin/auth/me'] = () => ok({ admin });
    routes['/api/admin/auth/logout'] = () => ok(null);
    routes['/api/admin/auth/refresh'] = () => ok({ tokens: { accessToken: fakeJwt('admin-b') } });

    await useAdminAuthStore.getState().login(admin.email, 'password12');
    await useAdminAuthStore.getState().logout();
    await vi.advanceTimersByTimeAsync(30 * MINUTE);

    expect(calls.map((call) => call.path)).not.toContain('/api/admin/auth/refresh');
    expect(useAdminAuthStore.getState()).toMatchObject({ admin: null, accessToken: null });
  });
});
