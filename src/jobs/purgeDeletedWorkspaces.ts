import type { AuthService } from '../services/AuthService';

const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Hourly, permanently removes workspaces whose 48-hour deletion window has passed. */
export function schedulePurgeDeletedWorkspaces(authService: AuthService): () => void {
  const run = () => {
    authService
      .purgeDeletedWorkspaces()
      .then((count) => {
        if (count) console.log(`Purged ${count} deleted workspace(s)`);
      })
      .catch((error: unknown) => console.error('Workspace purge failed:', error));
  };
  run();
  const timer = setInterval(run, PURGE_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
