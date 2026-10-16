import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PublicMember } from '../../api/members';
import {
  addTicketComment,
  deleteTicketComment,
  getTicket,
  patchTicketComment,
  type Ticket,
  type TicketActivity,
  type TicketBoardView,
  type TicketComment,
  type TicketPatch,
} from '../../api/tickets';
import { useAuthStore, useTicketStore } from '../../stores/StoresIndex';
import { confirmDelete } from '../layout/deleteDialogue';
import { AssigneeCell, DueCell, PriorityCell, StatusCell } from './TicketCells';
import { Avatar, MenuTrigger, OptionMenu } from './TicketMenus';
import { describeActivity, memberLabel, timeAgo } from './ticketMeta';

function token(): string {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error('Not signed in');
  return accessToken;
}

type TimelineEntry =
  | { kind: 'comment'; at: string; comment: TicketComment }
  | { kind: 'activity'; at: string; activity: TicketActivity };

export function TicketDetailPanel({
  view,
  ticketKey,
  members,
  editable,
  onClose,
}: {
  view: TicketBoardView;
  ticketKey: string;
  members: PublicMember[];
  editable: boolean;
  onClose: () => void;
}) {
  const ticket = view.tickets.find((item) => item.key.toLowerCase() === ticketKey.toLowerCase());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, [ticket?.id]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !(event.target as HTMLElement).closest('input, textarea')) onClose();
  }

  return (
    <div className="ticket-panel-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        ref={panelRef}
        className="ticket-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ticket ? `${ticket.key} ${ticket.title}` : 'Ticket'}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {ticket ? (
          <TicketBody key={ticket.id} view={view} ticket={ticket} members={members} editable={editable} onClose={onClose} />
        ) : (
          <>
            <div className="ticket-panel-bar">
              <span className="ticket-key">{ticketKey}</span>
              <button type="button" className="kanban-icon-btn" aria-label="Close" onClick={onClose}>
                ×
              </button>
            </div>
            <p className="muted ticket-panel-section">This ticket isn’t on this board. It may have been deleted.</p>
          </>
        )}
      </aside>
    </div>
  );
}

function TicketBody({
  view,
  ticket,
  members,
  editable,
  onClose,
}: {
  view: TicketBoardView;
  ticket: Ticket;
  members: PublicMember[];
  editable: boolean;
  onClose: () => void;
}) {
  const patchTicket = useTicketStore((state) => state.patchTicket);
  const deleteTicket = useTicketStore((state) => state.deleteTicket);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [activity, setActivity] = useState<TicketActivity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardId = view.board.id;
  const byId = new Map(members.map((member) => [member.userId, member]));
  const status = view.statuses.find((item) => item.id === ticket.statusId);
  const group = view.groups.find((item) => item.id === ticket.groupId);

  // Refetch comments and activity whenever the ticket itself changes (its updatedAt moves on every save).
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getTicket(accessToken, ticket.id).then(
      (detail) => {
        if (cancelled) return;
        setComments(detail.comments);
        setActivity(detail.activity);
        setLoaded(true);
      },
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the ticket')
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, ticket.id, ticket.updatedAt]);

  async function patch(input: TicketPatch) {
    setError(null);
    try {
      await patchTicket(boardId, ticket.id, input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the ticket');
    }
  }

  async function remove() {
    const ok = await confirmDelete({
      title: `Delete ${ticket.key}?`,
      message: `“${ticket.title}” and its comments will be removed from the board.`,
      confirmLabel: 'Delete ticket',
    });
    if (!ok) return;
    try {
      await deleteTicket(boardId, ticket.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the ticket');
    }
  }

  const timeline: TimelineEntry[] = [
    ...comments.map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment })),
    ...activity.map((entry) => ({ kind: 'activity' as const, at: entry.createdAt, activity: entry })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <div className="ticket-panel-bar">
        <span className="ticket-key">{ticket.key}</span>
        <span className="ticket-panel-actions">
          {editable ? (
            <button type="button" className="linkish danger" onClick={() => void remove()}>
              Delete
            </button>
          ) : null}
          <button type="button" className="kanban-icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            ×
          </button>
        </span>
      </div>

      <div className="ticket-panel-section">
        <TitleField key={ticket.title} title={ticket.title} editable={editable} onSave={(title) => void patch({ title })} />
        <dl className="ticket-fields">
          <dt>Status</dt>
          <dd>
            <StatusCell status={status} statuses={view.statuses} editable={editable} onChange={(statusId) => void patch({ statusId })} />
          </dd>
          <dt>Priority</dt>
          <dd>
            <PriorityCell priority={ticket.priority} editable={editable} onChange={(priority) => void patch({ priority })} />
          </dd>
          <dt>Assignees</dt>
          <dd className="ticket-field-people">
            <AssigneeCell
              assigneeIds={ticket.assigneeIds}
              members={members}
              editable={editable}
              onChange={(assigneeIds) => void patch({ assigneeIds })}
            />
            {ticket.assigneeIds.length > 0 ? (
              <span className="ticket-field-names">
                {ticket.assigneeIds.map((id) => memberLabel(byId.get(id))).join(', ')}
              </span>
            ) : null}
          </dd>
          <dt>Due</dt>
          <dd>
            <DueCell
              dueDate={ticket.dueDate}
              done={status?.category === 'done'}
              editable={editable}
              onChange={(dueDate) => void patch({ dueDate })}
            />
          </dd>
          <dt>Group</dt>
          <dd>
            {editable ? (
              <MenuTrigger
                className="ticket-cell-button"
                label={`Group: ${group?.name ?? 'none'}. Change group`}
                menu={(anchor, close) => (
                  <OptionMenu
                    anchor={anchor}
                    label="Group"
                    value={ticket.groupId}
                    options={view.groups.map((item) => ({ id: item.id, label: item.name, color: item.color }))}
                    onSelect={(groupId) => void patch({ groupId })}
                    onClose={close}
                  />
                )}
              >
                <span className={`ticket-pill ticket-pill-soft note-type-${group?.color ?? 'gray'}`}>{group?.name}</span>
              </MenuTrigger>
            ) : (
              <span className={`ticket-pill ticket-pill-soft note-type-${group?.color ?? 'gray'}`}>{group?.name}</span>
            )}
          </dd>
          <dt>Created</dt>
          <dd className="ticket-field-names">
            {new Date(ticket.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {ticket.createdBy ? ` by ${memberLabel(byId.get(ticket.createdBy))}` : ''}
          </dd>
          <dt>Labels</dt>
          <dd>
            <LabelsField labels={ticket.labels} editable={editable} onChange={(labels) => void patch({ labels })} />
          </dd>
        </dl>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="ticket-panel-section">
        <h3 className="ticket-panel-heading">Description</h3>
        <DescriptionField
          description={ticket.description}
          editable={editable}
          onSave={(description) => patch({ description })}
        />
      </div>

      <div className="ticket-panel-section">
        <h3 className="ticket-panel-heading">Updates</h3>
        {!loaded ? <p className="muted">Loading…</p> : null}
        <ol className="ticket-timeline">
          {timeline.map((entry) =>
            entry.kind === 'comment' ? (
              <CommentItem
                key={entry.comment.id}
                comment={entry.comment}
                author={entry.comment.authorId ? byId.get(entry.comment.authorId) : undefined}
                onChanged={(next) =>
                  setComments((current) =>
                    next ? current.map((item) => (item.id === next.id ? next : item)) : current.filter((item) => item.id !== entry.comment.id)
                  )
                }
                onError={setError}
              />
            ) : (
              <li key={entry.activity.id} className="ticket-activity">
                <strong>{entry.activity.actorName ?? 'Someone'}</strong>{' '}
                {describeActivity(entry.activity, (id) => memberLabel(byId.get(id)))}
                <time dateTime={entry.at}> · {timeAgo(entry.at)}</time>
              </li>
            )
          )}
        </ol>
        {editable ? (
          <CommentComposer
            ticketId={ticket.id}
            onPosted={(comment) => setComments((current) => [...current, comment])}
            onError={setError}
          />
        ) : null}
      </div>
    </>
  );
}

function TitleField({ title, editable, onSave }: { title: string; editable: boolean; onSave: (title: string) => void }) {
  const [draft, setDraft] = useState(title);
  if (!editable) return <h2 className="ticket-panel-title">{title}</h2>;
  return (
    <textarea
      className="ticket-panel-title ticket-panel-title-input"
      aria-label="Ticket title"
      rows={1}
      maxLength={300}
      value={draft}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, ' '))}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== title) onSave(next);
        else setDraft(title);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(title);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function LabelsField({
  labels,
  editable,
  onChange,
}: {
  labels: string[];
  editable: boolean;
  onChange: (labels: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const label = draft.trim();
    setDraft('');
    if (!label || labels.some((item) => item.toLowerCase() === label.toLowerCase())) return;
    onChange([...labels, label]);
  }

  return (
    <span className="ticket-labels-field">
      {labels.map((label) => (
        <span key={label} className="ticket-label">
          {label}
          {editable ? (
            <button
              type="button"
              aria-label={`Remove label ${label}`}
              onClick={() => onChange(labels.filter((item) => item !== label))}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {editable ? (
        <input
          className="ticket-label-input"
          aria-label="Add label"
          placeholder="Add label"
          maxLength={40}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
        />
      ) : labels.length === 0 ? (
        <span className="ticket-empty">—</span>
      ) : null}
    </span>
  );
}

function DescriptionField({
  description,
  editable,
  onSave,
}: {
  description: string;
  editable: boolean;
  onSave: (description: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await onSave(draft);
    setBusy(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="ticket-description-edit">
        <textarea
          className="ticket-textarea"
          aria-label="Description (markdown)"
          rows={10}
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save();
          }}
        />
        <div className="ticket-form-actions">
          <button type="button" onClick={() => void save()} disabled={busy}>
            Save
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setDraft(description);
              setEditing(false);
            }}
          >
            Cancel
          </button>
          <span className="muted">Markdown supported</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ticket-description">
      {description.trim() ? (
        <div className="markdown-preview ticket-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
        </div>
      ) : (
        <p className="muted">No description yet.</p>
      )}
      {editable ? (
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setDraft(description);
            setEditing(true);
          }}
        >
          {description.trim() ? 'Edit description' : 'Add a description'}
        </button>
      ) : null}
    </div>
  );
}

function CommentItem({
  comment,
  author,
  onChanged,
  onError,
}: {
  comment: TicketComment;
  author: PublicMember | undefined;
  onChanged: (comment: TicketComment | null) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  async function save() {
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
    <li className="ticket-comment">
      <div className="ticket-comment-head">
        <Avatar member={author ?? { userId: '', email: comment.authorName ?? '?', role: '' }} />
        <strong>{comment.authorName ?? 'Former member'}</strong>
        <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
        {comment.updatedAt !== comment.createdAt ? <span className="muted">(edited)</span> : null}
        <span className="ticket-comment-actions">
          {comment.editable && !editing ? (
            <button type="button" className="linkish" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          {comment.deletable ? (
            <button type="button" className="linkish danger" onClick={() => void remove()}>
              Delete
            </button>
          ) : null}
        </span>
      </div>
      {editing ? (
        <div className="ticket-description-edit">
          <textarea
            className="ticket-textarea"
            aria-label="Edit comment"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="ticket-form-actions">
            <button type="button" onClick={() => void save()} disabled={!draft.trim()}>
              Save
            </button>
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="markdown-preview ticket-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
        </div>
      )}
    </li>
  );
}

function CommentComposer({
  ticketId,
  onPosted,
  onError,
}: {
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
      <textarea
        className="ticket-textarea"
        aria-label="Write an update"
        placeholder="Write an update…"
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void onSubmit();
        }}
      />
      <div className="ticket-form-actions">
        <button type="submit" disabled={busy || !body.trim()}>
          Comment
        </button>
        <span className="muted">⌘/Ctrl + Enter</span>
      </div>
    </form>
  );
}
