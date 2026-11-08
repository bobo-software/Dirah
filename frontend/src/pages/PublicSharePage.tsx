import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublicMarkdown } from '../api/share';
import { BrandLink, ThemeToggle } from '../components/ComponentsIndex';
import { SITE_NAME, Seo, absoluteUrl, excerptFromMarkdown } from '../seo/index';

export function PublicSharePage() {
  const { token } = useParams();
  const [title, setTitle] = useState('Shared document');
  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
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
        setUpdatedAt(body.updatedAt);
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

  const description = useMemo(() => excerptFromMarkdown(content), [content]);
  const canonical = token ? `/s/${token}` : '/';

  const jsonLd = useMemo(() => {
    if (error || !token) return undefined;
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      mainEntityOfPage: absoluteUrl(canonical),
      dateModified: updatedAt ?? undefined,
      author: { '@type': 'Organization', name: SITE_NAME },
      publisher: { '@type': 'Organization', name: SITE_NAME },
      articleBody: excerptFromMarkdown(content, 20000),
    };
  }, [error, token, title, description, canonical, updatedAt, content]);

  if (error) {
    return (
      <div className="public-share">
        <Seo title="Link not found" description="This share link is not available." canonical={canonical} noIndex />
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
      <Seo title={title} description={description} canonical={canonical} type="article" modifiedTime={updatedAt ?? undefined} jsonLd={jsonLd} />
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
