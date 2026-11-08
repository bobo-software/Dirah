import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import {
  ASSET_ROLES,
  formatBytes,
  formatDuration,
  getAsset,
  patchAsset,
  reprocessAsset,
  type AssetRole,
  type MediaAsset,
} from '../api/assets';
import type { PublicPage } from '../api/client';
import { EMPTY_PAGES, useAuthStore, usePageStore } from '../stores/StoresIndex';
import { Button } from '../components/buttons/Button';
import { canEdit, type WorkspaceOutlet } from './workspaceContext';

/** The path agents use for a node: folder slugs, then the asset's slug (refs/characters/hero.png). */
function docsPath(pages: PublicPage[], pageId: string): string {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const parts: string[] = [];
  let cursor = byId.get(pageId);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    parts.unshift(cursor.kind === 'markdown' ? `${cursor.slug}.md` : (cursor.slug ?? 'untitled'));
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return parts.join('/');
}

type Draft = {
  title: string;
  role: AssetRole;
  tags: string;
  description: string;
  promptHint: string;
  sourceUrl: string;
  license: string;
};

function draftOf(asset: MediaAsset): Draft {
  return {
    title: asset.title,
    role: asset.role,
    tags: asset.tags.join(', '),
    description: asset.description,
    promptHint: asset.promptHint,
    sourceUrl: asset.sourceUrl ?? '',
    license: asset.license ?? '',
  };
}

function useCopy(): [string | null, (label: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  return [
    copied,
    (label, text) => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(label);
        window.setTimeout(() => setCopied(null), 1600);
      });
    },
  ];
}

export function AssetPage() {
  const { workspaceId, pageId } = useParams();
  const { role } = useOutletContext<WorkspaceOutlet>();
  const editable = canEdit(role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const pages = usePageStore((state) => state.byWorkspace[workspaceId ?? ''] ?? EMPTY_PAGES);
  const mergePage = usePageStore((state) => state.mergePage);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, copy] = useCopy();
  const path = useMemo(() => (pageId ? docsPath(pages, pageId) : ''), [pages, pageId]);

  useEffect(() => {
    if (!accessToken || !pageId) return;
    // The page is keyed by asset id, so a new asset mounts fresh state.
    let cancelled = false;
    getAsset(accessToken, pageId)
      .then((loaded) => {
        if (cancelled) return;
        setAsset(loaded);
        setDraft(draftOf(loaded));
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load media'));
    return () => {
      cancelled = true;
    };
  }, [accessToken, pageId]);

  // Previews are made in the background; check back until they are done.
  useEffect(() => {
    if (!accessToken || !asset || asset.status !== 'processing') return;
    const timer = window.setTimeout(() => {
      void getAsset(accessToken, asset.id).then((next) => setAsset(next)).catch(() => undefined);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [accessToken, asset]);

  if (error) return <p className="error">{error}</p>;
  if (!asset || !draft) return <p className="muted">Loading…</p>;

  const original = draftOf(asset);
  const dirty = (Object.keys(draft) as Array<keyof Draft>).some((key) => draft[key] !== original[key]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !asset || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const next = await patchAsset(accessToken, asset.id, {
        title: draft.title,
        role: draft.role,
        tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        description: draft.description,
        promptHint: draft.promptHint,
        sourceUrl: draft.sourceUrl.trim() || null,
        license: draft.license.trim() || null,
      });
      setAsset(next);
      setDraft(draftOf(next));
      const page = pages.find((item) => item.id === next.id);
      if (page && (page.title !== next.title || page.slug !== next.slug)) {
        mergePage({ ...page, title: next.title, slug: next.slug });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function onReprocess() {
    if (!accessToken || !asset) return;
    setAsset(await reprocessAsset(accessToken, asset.id));
  }

  const facts = [
    asset.mediaType,
    asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
    asset.durationMs ? formatDuration(asset.durationMs) : null,
    asset.fps ? `${asset.fps} fps` : null,
    asset.mediaType === 'video' && asset.hasAudio === false ? 'no audio' : null,
    asset.ext.toUpperCase(),
    formatBytes(asset.byteSize),
  ].filter(Boolean);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <section className="asset-page">
      <header className="asset-header">
        <h1>{asset.title}</h1>
        <p className="muted asset-facts">
          {facts.join(' · ')}
          {asset.status === 'processing' ? ' · making previews…' : null}
        </p>
      </header>

      <div className={`asset-viewer ${asset.mediaType}`}>
        {asset.mediaType === 'image' ? (
          <a href={asset.links.url.url} target="_blank" rel="noreferrer">
            <img src={asset.links.previewUrl?.url ?? asset.links.url.url} alt={asset.description || asset.title} />
          </a>
        ) : asset.mediaType === 'video' ? (
          <video controls preload="metadata" poster={asset.links.thumbnailUrl?.url} src={asset.links.url.url} />
        ) : (
          <>
            {asset.links.previewUrl ? <img className="asset-waveform" src={asset.links.previewUrl.url} alt="" /> : null}
            <audio controls preload="metadata" src={asset.links.url.url} />
          </>
        )}
      </div>

      {asset.status === 'failed' ? (
        <p className="error asset-failed">
          No preview could be made{asset.error ? `: ${asset.error}` : ''}.{' '}
          {editable ? (
            <Button variant="link" type="button" onClick={() => void onReprocess()}>
              Try again
            </Button>
          ) : null}
        </p>
      ) : null}

      <div className="asset-actions">
        <Button type="button" variant="link" onClick={() => copy('path', path)} title="Path agents pass to get_asset">
          {copied === 'path' ? 'Copied' : `Copy MCP path (${path})`}
        </Button>
        <Button type="button" variant="link" onClick={() => copy('link', asset.links.url.url)} title={`Expires ${new Date(asset.links.url.expiresAt).toLocaleTimeString()}`}>
          {copied === 'link' ? 'Copied' : 'Copy temporary link'}
        </Button>
        {asset.mediaType === 'video' && asset.links.previewUrl ? (
          <a className="linkish" href={asset.links.previewUrl.url} target="_blank" rel="noreferrer">
            Contact sheet
          </a>
        ) : null}
      </div>

      <form className="asset-meta" onSubmit={(event) => void onSave(event)}>
        <fieldset disabled={!editable || saving}>
          <label>
            Title
            <input value={draft.title} onChange={(event) => set('title', event.target.value)} />
          </label>
          <label>
            Role
            <select value={draft.role} onChange={(event) => set('role', event.target.value as AssetRole)}>
              {ASSET_ROLES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tags
            <input value={draft.tags} placeholder="hero, night, neon" onChange={(event) => set('tags', event.target.value)} />
          </label>
          <label className="wide">
            Description
            <textarea
              rows={3}
              value={draft.description}
              placeholder="What it shows: subject, look, lighting, camera, mood. Agents search this."
              onChange={(event) => set('description', event.target.value)}
            />
          </label>
          <label className="wide">
            Prompt hint
            <textarea
              rows={2}
              value={draft.promptHint}
              placeholder="Wording to reuse in generation prompts for this reference"
              onChange={(event) => set('promptHint', event.target.value)}
            />
          </label>
          <label>
            Source
            <input value={draft.sourceUrl} placeholder="https://…" onChange={(event) => set('sourceUrl', event.target.value)} />
          </label>
          <label>
            License
            <input value={draft.license} placeholder="e.g. CC BY 4.0, internal" onChange={(event) => set('license', event.target.value)} />
          </label>
        </fieldset>
        {editable ? (
          <div className="asset-save">
            <Button type="submit" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {dirty ? (
              <Button type="button" variant="link" onClick={() => setDraft(original)}>
                Discard
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>

      {asset.generation ? (
        <section className="asset-generation">
          <h2>Generated</h2>
          <dl>
            {asset.generation.model ? (
              <>
                <dt>Model</dt>
                <dd>{asset.generation.model}</dd>
              </>
            ) : null}
            {asset.generation.prompt ? (
              <>
                <dt>Prompt</dt>
                <dd className="asset-prompt">{asset.generation.prompt}</dd>
              </>
            ) : null}
            {asset.generation.sourceAssetIds?.length ? (
              <>
                <dt>References</dt>
                <dd>
                  {asset.generation.sourceAssetIds.map((id) => {
                    const ref = pages.find((page) => page.id === id);
                    return (
                      <Link key={id} className="asset-ref" to={`/w/${workspaceId}/p/${id}`}>
                        {ref?.title ?? id.slice(0, 8)}
                      </Link>
                    );
                  })}
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}
    </section>
  );
}
