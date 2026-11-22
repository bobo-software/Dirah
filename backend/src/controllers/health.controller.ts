import { Request, Response } from 'express';

/**
 * Liveness and readiness for the API.
 *
 * `/health` must stay cheap and dependency-free: Docker and Coolify call it on
 * a timer, and a database outage must not make the process look dead.
 * `/health/ready` is the one that talks to Postgres and object storage.
 *
 * Neither handler goes through ResponseUtils, because that writes a
 * request_logs row per call: a 30s probe would add ~2 900 rows a day.
 */

export type ProbeStatus = 'up' | 'down';

export type ProbeResult = {
  status: ProbeStatus;
  latencyMs: number;
  /** Stable code only. Raw errors can carry hosts, SQL and credentials. */
  error?: 'probe_failed' | 'timeout';
};

export type HealthProbes = {
  database: () => Promise<unknown>;
  storage: () => Promise<unknown>;
};

const DEFAULT_PROBE_TIMEOUT_MS = 2_000;

function failed(error: unknown): ProbeResult['error'] {
  return error instanceof Error && error.message === 'probe_timeout' ? 'timeout' : 'probe_failed';
}

async function runProbe(
  name: string,
  probe: () => Promise<unknown>,
  timeoutMs: number
): Promise<ProbeResult> {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('probe_timeout')), timeoutMs);
        timer.unref();
      }),
    ]);
    return { status: 'up', latencyMs: Date.now() - startedAt };
  } catch (error) {
    console.warn(
      `Health probe failed: ${name}`,
      error instanceof Error ? error.message : String(error)
    );
    return { status: 'down', latencyMs: Date.now() - startedAt, error: failed(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getHealth(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    success: true,
    message: 'ok',
    data: {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
}

export function createReadinessHandler(
  probes: HealthProbes,
  options: { timeoutMs?: number } = {}
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

  return async function getReadiness(_req: Request, res: Response) {
    const [database, storage] = await Promise.all([
      runProbe('database', probes.database, timeoutMs),
      runProbe('storage', probes.storage, timeoutMs),
    ]);
    const ready = database.status === 'up' && storage.status === 'up';

    res.setHeader('Cache-Control', 'no-store');
    return res.status(ready ? 200 : 503).json({
      success: ready,
      message: ready ? 'ready' : 'not ready',
      data: {
        status: ready ? 'ready' : 'not_ready',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        checks: { database, storage },
      },
    });
  };
}
