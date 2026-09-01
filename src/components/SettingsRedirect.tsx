import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/StoresIndex';
import { pickDefaultWorkspaceId } from './lastWorkspace';

export default function SettingsRedirect() {
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    void fetchWorkspaces()
      .then((workspaces) => {
        const id = pickDefaultWorkspaceId(workspaces.map((item) => item.id));
        setTo(id ? `/w/${id}/settings` : '/');
      })
      .catch(() => setTo('/'));
  }, [fetchWorkspaces]);

  if (!to) return <p className="muted">Loading settings…</p>;
  return <Navigate to={to} replace />;
}
