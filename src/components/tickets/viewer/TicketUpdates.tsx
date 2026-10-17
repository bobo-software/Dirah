import { useState, type FormEvent } from 'react';
import type { PublicMember } from '../../../api/members';
import {
  addTicketComment,
  deleteTicketComment,
  patchTicketComment,
  type TicketActivity,
  type TicketComment,
} from '../../../api/tickets';
import { useAuthStore } from '../../../stores/StoresIndex';
import { RichMarkdownInput } from '../../editor/RichMarkdownInput';
import { confirmDelete } from '../../layout/deleteDialogue';
import { Avatar } from '../TicketMenus';
import { TicketMarkdown } from '../TicketMarkdown';
import { describeActivity, memberLabel, timeAgo } from '../ticketMeta';
import { Button } from '../../buttons/Button';

type Tab = 'all' | 'comments' | 'history';

type Entry =
  | { kind: 'comment'; at: string; comment: TicketComment }
  | { kind: 'activity'; at: string; activity: TicketActivity };

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

/** Comments and history, newest first, with the composer on top. */
export function TicketUpdates({
  workspaceId,
  ticketId,
  members,
  editable,
  loaded,
  comments,
  activity,
  onComments,
  onError,
}: {
  workspaceId: string;
  ticketId: string;
  members: PublicMember[];
  editable: boolean;
  loaded: boolean;
  comments: TicketComment[];
  activity: TicketActivity[];
  onComments: (update: (comments: TicketComment[]) => TicketComment[]) => void;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('all');
  const byId = new Map(members.map((member) => [member.userId, member]));

  const entries: Entry[] = [
    ...(tab !== 'history' ? comments.map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment })) : []),
    ...(tab !== 'comments' ? activity.map((entry) => ({ kind: 'activity' as const, at: entry.createdAt, activity: entry })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: comments.length + activity.length },
    { id: 'comments', label: 'Comments', count: comments.length },
    { id: 'history', label: 'History', count: activity.length },
  ];

  return (
    <section className="ticket-viewer-section ticket-viewer-feed" aria-label="Updates">
      <div className="ticket-feed-head">
        <h3 className="ticket-viewer-heading">Updates</h3>
        <div className="ticket-feed-tabs" role="tablist" aria-label="Show">
          {tabs.map((item) => (
            <Button variant="plain"
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'ticket-feed-tab on' : 'ticket-feed-tab'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {loaded ? <span className="ticket-feed-count">{item.count}</span> : null}
            </Button>
          ))}
        </div>
      </div>
      {editable && tab !== 'history' ? (
        <CommentComposer
          workspaceId={workspaceId}
          ticketId={ticketId}
          onPosted={(comment) => onComments((current) => [...current, comment])}
          onError={onError}
        />
      ) : null}
      {!loaded ? (
        <div className="ticket-feed-skeleton" aria-label="Loading updates">
          <span />
          <span />
        </div>
      ) : entries.length === 0 ? (
        <p className="ticket-feed-empty">
          {tab === 'history'
            ? 'No changes yet.'
            : editable
              ? 'No comments yet. Share progress, ask a question or attach a file.'
              : 'No comments yet.'}
        </p>
      ) : (
        <ol className="ticket-timeline">
          {entries.map((entry) =>
            entry.kind === 'comment' ? (
              <CommentItem
                key={entry.comment.id}
                workspaceId={workspaceId}
                comment={entry.comment}
                author={entry.comment.authorId ? byId.get(entry.comment.authorId) : undefined}
                onChanged={(next) =>
                  onComments((current) =>
                    next
                      ? current.map((item) => (item.id === next.id ? next : item))
                      : current.filter((item) => item.id !== entry.comment.id)
                  )
                }
                onError={onError}
              />
            ) : (
              <li key={entry.activity.id} className="ticket-activity">
                <span className="ticket-activity-dot" aria-hidden="true" />
                <span>
                  <strong>{entry.activity.actorName ?? 'Someone'}</strong>{' '}
                  {describeActivity(entry.activity, (id) => memberLabel(byId.get(id)))}
                </span>
                <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
                  {timeAgo(entry.at)}
                </time>
              </li>
            )
          )}
        </ol>
      )}
    </section>
  );
}

function CommentItem({
  workspaceId,
  comment,
  author,
  onChanged,
  onError,
}: {
  workspaceId: string;
  comment: TicketComment;
  author: PublicMember | undefined;
  onChanged: (comment: TicketComment | null) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  async function save() {
    if (!draft.trim()) return;
    try {
      onChanged(await patchTicketComment(token(), comment.id, draft));
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not edit the comment');
    }
  }

  async function remove() {
    const ok = await confirmDelete({ title: 'Delete comment?', message: 'This comment will be removed.', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await deleteTicketComment(token(), comment.id);
      onChanged(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete the comment');
    }
  }

  return (
    <li className={editing ? 'ticket-comment is-editing' : 'ticket-comment'}>
      <div className="ticket-comment-head">
        <Avatar member={author ?? { userId: '', email: comment.authorName ?? '?', role: '' }} size="md" />
        <strong>{comment.authorName ?? 'Former member'}</strong>
        <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString()}>
          {timeAgo(comment.createdAt)}
        </time>
        {comment.updatedAt !== comment.createdAt ? <span className="muted">· edited</span> : null}
        {!editing ? (
          <span className="ticket-comment-actions">
            {comment.editable ? (
              <Button variant="link"
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            ) : null}
            {comment.deletable ? (
              <Button variant="link" type="button" className="danger" onClick={() => void remove()}>
                Delete
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
      {editing ? (
        <RichMarkdownInput
          value={draft}
          onChange={setDraft}
          label="Edit comment"
          workspaceId={workspaceId}
          autoFocus
          onSubmit={() => void save()}
          onError={onError}
          actions={({ uploading }) => (
            <>
              <Button variant="link" type="button" className="rich-input-hint" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={uploading || !draft.trim()}>
                Save
              </Button>
            </>
          )}
        />
      ) : (
        <div className="ticket-comment-body">
          <TicketMarkdown>{comment.body}</TicketMarkdown>
        </div>
      )}
    </li>
  );
}

function CommentComposer({
  workspaceId,
  ticketId,
  onPosted,
  onError,
}: {
  workspaceId: string;
  ticketId: string;
  onPosted: (comment: TicketComment) => void;
  onError: (message: string) => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      onPosted(await addTicketComment(token(), ticketId, body));
      setBody('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not post the comment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ticket-composer" onSubmit={(event) => void onSubmit(event)}>
      <RichMarkdownInput
        value={body}
        onChange={setBody}
        label="Write an update"
        placeholder="Write an update…"
        workspaceId={workspaceId}
        onSubmit={() => void onSubmit()}
        onError={onError}
        actions={({ uploading }) => (
          <>
            <span className="muted rich-input-hint">⌘/Ctrl + Enter</span>
            <Button type="submit" disabled={busy || uploading || !body.trim()}>
              {busy ? 'Posting…' : 'Comment'}
            </Button>
          </>
        )}
      />
    </form>
  );
}
