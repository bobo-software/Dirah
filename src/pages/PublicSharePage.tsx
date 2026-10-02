import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublicMarkdown } from '../api/share';
import { BrandLink, ThemeToggle } from '../components/ComponentsIndex';

export function PublicSharePage() {
  const { token } = useParams();
  const [title, setTitle] = useState('Shared document');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const body = await getPublicMarkdown(token);
        if (cancelled) return;
        setTitle(body.page.title);
        setContent(body.content);
        setError(null);
      } catch (caught: unknown) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Share link not found');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div className="public-share">
        <header className="topbar">
          <BrandLink />
          <div className="topbar-user">
            <ThemeToggle />
          </div>
        </header>
        <div className="public-share-head">
          <div>
            <p className="error" role="alert">
              {error}
            </p>
            <p>
              <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="public-share">
      <header className="topbar">
        <BrandLink />
        <div className="topbar-user">
          <ThemeToggle />
        </div>
      </header>
      <header className="public-share-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">Shared markdown</p>
        </div>
      </header>
      <div className="markdown-preview public-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '_Empty document._'}</ReactMarkdown>
      </div>
    </div>
  );
}
