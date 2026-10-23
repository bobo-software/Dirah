import { useParams } from 'react-router-dom';
import { DocsBrowser } from '../components/ComponentsIndex';

export function CollectionPage() {
  const { workspaceId } = useParams();

  if (!workspaceId) {
    return <p className="muted">Missing workspace.</p>;
  }

  return (
    <section className="collection-pane">
      <DocsBrowser workspaceId={workspaceId} title="Collection" />
    </section>
  );
}
