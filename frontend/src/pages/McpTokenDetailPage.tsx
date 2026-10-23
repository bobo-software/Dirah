import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMcpStore } from '../stores/StoresIndex';
import { BackIcon, TokenDetailBody } from '../components/ComponentsIndex';

export function McpTokenDetailPage() {
  const { workspaceId, tokenId } = useParams();
  const backLink = workspaceId ? `/w/${workspaceId}/settings?tab=mcp` : '/settings';
  const location = useLocation();
  const tokens = useMcpStore((state) => state.tokens);
  const loaded = useMcpStore((state) => state.loaded);
  const fetchAll = useMcpStore((state) => state.fetchAll);
  const fetchTokenAccess = useMcpStore((state) => state.fetchTokenAccess);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

  const token = tokens.find((item) => item.id === tokenId);
  const secretFromCreation = (location.state as { secret?: string } | null)?.secret ?? null;

  useEffect(() => {
    if (!loaded) {
      void fetchAll().catch((error: unknown) => {
        setLoadMessage(error instanceof Error ? error.message : 'Could not load token');
      });
    }
  }, [loaded, fetchAll]);

  useEffect(() => {
    if (!tokenId) return;
    void fetchTokenAccess(tokenId).catch((error: unknown) => {
      setLoadMessage(error instanceof Error ? error.message : 'Could not load workspace access');
    });
  }, [tokenId, fetchTokenAccess]);

  if (!token) {
    return (
      <section className="settings-page">
        <Link className="back-link" to={backLink}>
          <BackIcon />
          MCP tokens
        </Link>
        {loadMessage ? (
          <p className="error" role="alert">
            {loadMessage}
          </p>
        ) : loaded ? (
          <p className="error" role="alert">
            Token not found.
          </p>
        ) : (
          <p className="muted">Loading token…</p>
        )}
      </section>
    );
  }

  return <TokenDetailBody key={token.id} token={token} backLink={backLink} secretFromCreation={secretFromCreation} />;
}
