import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useMcpStore, useWorkspaceStore } from '../stores/StoresIndex';
import type { TokenAccessValue } from '../components/TokenAccessFields';
import { TokenAccessFields } from '../components/ComponentsIndex';
import type { WorkspaceOutlet } from './workspaceContext';

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

export function McpTokenCreatePage() {
  const outlet = useOutletContext<WorkspaceOutlet | null>();
  const workspaceId = outlet?.workspaceId;
  const navigate = useNavigate();
  const createToken = useMcpStore((state) => state.createToken);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const grantableWorkspaces = useMemo(() => workspaces.filter((w) => !w.encrypted), [workspaces]);
  const encryptedCount = workspaces.length - grantableWorkspaces.length;

  const [name, setName] = useState('Cursor');
  const [access, setAccess] = useState<Map<string, TokenAccessValue>>(new Map());
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seededWorkspace = useRef(false);

  const backLink = workspaceId ? `/w/${workspaceId}/settings?tab=mcp` : '/settings';
  const detailPath = (tokenId: string) =>
    workspaceId ? `/w/${workspaceId}/settings/mcp/${tokenId}` : `/settings/mcp/${tokenId}`;

  useEffect(() => {
    void fetchWorkspaces().catch(() => undefined);
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (!workspaceId || seededWorkspace.current) return;
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace || workspace.encrypted) return;
    seededWorkspace.current = true;
    setAccess(new Map([[workspaceId, { allowlisted: true, canWrite: workspace.role !== 'viewer' }]]));
    setDefaultWorkspaceId(workspaceId);
  }, [workspaceId, workspaces]);

  function onAccessChange(id: string, patch: Partial<TokenAccessValue>) {
    setAccess((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? { allowlisted: false, canWrite: false };
      const merged = { ...current, ...patch };
      next.set(id, merged);
      if (!merged.allowlisted && defaultWorkspaceId === id) {
        setDefaultWorkspaceId(undefined);
      }
      return next;
    });
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const workspaceAccess = Array.from(access.entries())
        .filter(([, v]) => v.allowlisted)
        .map(([id, v]) => ({ workspaceId: id, canWrite: v.canWrite }));
      const token = await createToken(name, defaultWorkspaceId, workspaceAccess);
      navigate(detailPath(token.id), { state: { secret: token.secret } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create token');
      setBusy(false);
    }
  }

  return (
    <section className="settings-page mcp-create-page">
      <Link className="back-link" to={backLink}>
        <BackIcon />
        MCP tokens
      </Link>
      <h1>New MCP token</h1>
      <p className="muted mcp-create-lede">
        Issue a key so a coding agent like Cursor or Claude Code can read your docs — and edit them, if you allow it.
      </p>
      {message ? (
        <p className="error" role="status">
          {message}
        </p>
      ) : null}

      <form className="mcp-create-form" onSubmit={(e) => void onCreate(e)}>
        <label className="mcp-field">
          <span className="mcp-field-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Token name" required />
          <span className="mcp-field-hint">Helps you recognize it later — try Cursor, Claude Code, or CI.</span>
        </label>

        <div className="mcp-field">
          <span className="mcp-field-label">Workspace access</span>
          <span className="mcp-field-hint">Choose which workspaces this token can reach, and whether it can write to them.</span>
          {grantableWorkspaces.length === 0 ? (
            <p className="muted">No workspaces available to grant access to.</p>
          ) : (
            <TokenAccessFields
              workspaces={grantableWorkspaces}
              value={access}
              defaultWorkspaceId={defaultWorkspaceId}
              onChange={onAccessChange}
              onDefaultChange={setDefaultWorkspaceId}
            />
          )}
          {encryptedCount > 0 ? (
            <span className="mcp-field-hint">
              {encryptedCount} encrypted workspace{encryptedCount === 1 ? '' : 's'} can't be reached by MCP tokens yet.
            </span>
          ) : null}
        </div>

        <button type="submit" className="mcp-create-submit" disabled={busy || !name.trim()}>
          <KeyIcon />
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </form>
    </section>
  );
}
