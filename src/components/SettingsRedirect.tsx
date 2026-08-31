import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { pickDefaultWorkspaceId } from './lastWorkspace';

export default function SettingsRedirect() {
  const { listWorkspaces } = useAuth();
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    void listWorkspaces()
      .then((workspaces) => {
        const id = pickDefaultWorkspaceId(workspaces.map((item) => item.id));
        setTo(id ? `/w/${id}/settings` : '/');
      })
      .catch(() => setTo('/'));
  }, [listWorkspaces]);

  if (!to) return <p className="muted">Loading settings…</p>;
  return <Navigate to={to} replace />;
}
