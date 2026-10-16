import { useState, type DragEvent } from 'react';
import type { PublicMember } from '../../api/members';
import type { Ticket, TicketBoardView, TicketGroup, TicketPatch } from '../../api/tickets';
import { useTicketStore } from '../../stores/StoresIndex';
import { confirmDelete } from '../layout/deleteDialogue';
import { ColorDot } from '../notes/table/ColorDot';
import type { SelectColor } from '../notes/table/columnTypes';
import { AssigneeCell, DueCell, PriorityCell, StatusCell } from './TicketCells';
import { formatCreated, matchesFilter } from './ticketMeta';

const ROW_DRAG = 'text/ticket-row';

type Drop = { groupId: string; targetId: string | null; after: boolean };

function insertionIndex(tickets: Ticket[], draggedId: string, targetId: string | null, after: boolean): number {
  const without = tickets.filter((ticket) => ticket.id !== draggedId);
  if (!targetId) return without.length;
  const target = without.findIndex((ticket) => ticket.id === targetId);
  if (target < 0) return without.length;
  return target + (after ? 1 : 0);
}

export function TicketTableView({
  view,
  members,
  editable,
  filter,
  onOpen,
  onAdd,
  onError,
}: {
  view: TicketBoardView;
  members: PublicMember[];
  editable: boolean;
  filter: string;
  onOpen: (ticket: Ticket) => void;
  onAdd: (defaults: { groupId: string }) => void;
  onError: (message: string) => void;
}) {
  const patchTicket = useTicketStore((state) => state.patchTicket);
  const moveTicket = useTicketStore((state) => state.moveTicket);
  const createGroup = useTicketStore((state) => state.createGroup);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const boardId = view.board.id;
  const filtering = filter.trim().length > 0;
  const canDrag = editable && !filtering;
  const groups = [...view.groups].sort((a, b) => a.position - b.position);
  const doneIds = new Set(view.statuses.filter((status) => status.category === 'done').map((status) => status.id));
  const statusById = new Map(view.statuses.map((status) => [status.id, status]));

  function fail(error: unknown, fallback: string) {
    onError(error instanceof Error ? error.message : fallback);
  }

  function patch(ticket: Ticket, input: TicketPatch) {
    patchTicket(boardId, ticket.id, input).catch((error: unknown) => fail(error, 'Could not update the ticket'));
  }

  function ticketsIn(groupId: string): Ticket[] {
    return view.tickets.filter((ticket) => ticket.groupId === groupId).sort((a, b) => a.position - b.position);
  }

  function onDrop(event: DragEvent, groupId: string) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData(ROW_DRAG) || dragId;
    const target = drop?.groupId === groupId ? drop : { groupId, targetId: null, after: true };
    setDrop(null);
    setDragId(null);
    if (!draggedId) return;
    const position = insertionIndex(ticketsIn(groupId), draggedId, target.targetId, target.after);
    const current = view.tickets.find((ticket) => ticket.id === draggedId);
    if (current && current.groupId === groupId && ticketsIn(groupId).findIndex((t) => t.id === draggedId) === position) {
      return;
    }
    moveTicket(boardId, draggedId, { groupId, position }).catch((error: unknown) => fail(error, 'Could not move the ticket'));
  }

  function toggle(groupId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div className={`ticket-table-wrap${dragId ? ' is-dragging' : ''}`}>
      {groups.map((group) => {
        const all = ticketsIn(group.id);
        const rows = all.filter((ticket) => matchesFilter(ticket, filter));
        const isCollapsed = collapsed.has(group.id);
        return (
          <section
            key={group.id}
            className={`ticket-group note-type-${group.color}`}
            aria-label={group.name}
            onDragOver={(event) => {
              if (!canDrag || !event.dataTransfer.types.includes(ROW_DRAG)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (!(event.target as HTMLElement).closest('.ticket-row')) {
                setDrop({ groupId: group.id, targetId: null, after: true });
              }
            }}
            onDrop={(event) => {
              if (canDrag && event.dataTransfer.types.includes(ROW_DRAG)) onDrop(event, group.id);
            }}
          >
            <GroupHeader
              boardId={boardId}
              group={group}
              count={all.length}
              collapsed={isCollapsed}
              editable={editable}
              canDelete={groups.length > 1}
              fallbackName={groups.find((item) => item.id !== group.id)?.name ?? ''}
              onToggle={() => toggle(group.id)}
              onError={onError}
            />
            {isCollapsed ? null : (
              <table className="ticket-table">
                <thead>
                  <tr>
                    <th className="ticket-col-handle" aria-hidden="true" />
                    <th className="ticket-col-title">Ticket</th>
                    <th className="ticket-col-status">Status</th>
                    <th className="ticket-col-priority">Priority</th>
                    <th className="ticket-col-people">Assignees</th>
                    <th className="ticket-col-due">Due</th>
                    <th className="ticket-col-created">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ticket) => {
                    const isDrop = drop?.targetId === ticket.id;
                    const dropClass = isDrop ? (drop.after ? ' drop-after' : ' drop-before') : '';
                    return (
                      <tr
                        key={ticket.id}
                        className={`ticket-row${dragId === ticket.id ? ' dragging' : ''}${dropClass}`}
                        draggable={canDrag}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(ROW_DRAG, ticket.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDragId(ticket.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDrop(null);
                        }}
                        onDragOver={(event) => {
                          if (!canDrag || !event.dataTransfer.types.includes(ROW_DRAG)) return;
                          event.preventDefault();
                          const rect = event.currentTarget.getBoundingClientRect();
                          const after = event.clientY > rect.top + rect.height / 2;
                          if (drop?.targetId !== ticket.id || drop.after !== after) {
                            setDrop({ groupId: group.id, targetId: ticket.id, after });
                          }
                        }}
                      >
                        <td className="ticket-col-handle">
                          {canDrag ? (
                            <span className="ticket-grip" aria-hidden="true">
                              ⋮⋮
                            </span>
                          ) : null}
                        </td>
                        <td className="ticket-col-title">
                          <button type="button" className="ticket-title-button" onClick={() => onOpen(ticket)}>
                            <span className="ticket-key">{ticket.key}</span>
                            <span className="ticket-title-text">{ticket.title}</span>
                            {ticket.labels.map((label) => (
                              <span key={label} className="ticket-label">
                                {label}
                              </span>
                            ))}
                          </button>
                        </td>
                        <td className="ticket-col-status">
                          <StatusCell
                            status={statusById.get(ticket.statusId)}
                            statuses={view.statuses}
                            editable={editable}
                            onChange={(statusId) => patch(ticket, { statusId })}
                          />
                        </td>
                        <td className="ticket-col-priority">
                          <PriorityCell
                            priority={ticket.priority}
                            editable={editable}
                            onChange={(priority) => patch(ticket, { priority })}
                          />
                        </td>
                        <td className="ticket-col-people">
                          <AssigneeCell
                            assigneeIds={ticket.assigneeIds}
                            members={members}
                            editable={editable}
                            onChange={(assigneeIds) => patch(ticket, { assigneeIds })}
                          />
                        </td>
                        <td className="ticket-col-due">
                          <DueCell
                            dueDate={ticket.dueDate}
                            done={doneIds.has(ticket.statusId)}
                            editable={editable}
                            onChange={(dueDate) => patch(ticket, { dueDate })}
                          />
                        </td>
                        <td className="ticket-col-created">
                          <time dateTime={ticket.createdAt} title={new Date(ticket.createdAt).toLocaleString()}>
                            {formatCreated(ticket.createdAt)}
                          </time>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && filtering ? (
                    <tr className="ticket-row-empty">
                      <td colSpan={7} className="muted">
                        No matching tickets.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {editable ? (
                  <tfoot>
                    <tr>
                      <td className="ticket-col-handle" />
                      <td colSpan={6}>
                        <button type="button" className="ticket-add-row" onClick={() => onAdd({ groupId: group.id })}>
                          + Add ticket
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            )}
          </section>
        );
      })}
      {editable ? (
        <button
          type="button"
          className="ticket-add-group"
          onClick={() =>
            createGroup(boardId, { name: 'New group' }).catch((error: unknown) => fail(error, 'Could not add a group'))
          }
        >
          + Add group
        </button>
      ) : null}
    </div>
  );
}

function GroupHeader({
  boardId,
  group,
  count,
  collapsed,
  editable,
  canDelete,
  fallbackName,
  onToggle,
  onError,
}: {
  boardId: string;
  group: TicketGroup;
  count: number;
  collapsed: boolean;
  editable: boolean;
  canDelete: boolean;
  fallbackName: string;
  onToggle: () => void;
  onError: (message: string) => void;
}) {
  const patchGroup = useTicketStore((state) => state.patchGroup);
  const deleteGroup = useTicketStore((state) => state.deleteGroup);
  const [name, setName] = useState(group.name);
  const [editing, setEditing] = useState(false);

  function fail(error: unknown, fallback: string) {
    onError(error instanceof Error ? error.message : fallback);
  }

  function save() {
    setEditing(false);
    const next = name.trim();
    if (!next || next === group.name) {
      setName(group.name);
      return;
    }
    patchGroup(boardId, group.id, { name: next }).catch((error: unknown) => {
      setName(group.name);
      fail(error, 'Could not rename the group');
    });
  }

  async function remove() {
    const ok = await confirmDelete({
      title: `Delete “${group.name}”?`,
      message: count > 0 ? `Its ${count} ticket${count === 1 ? '' : 's'} will move to “${fallbackName}”.` : 'This group is empty.',
      confirmLabel: 'Delete group',
    });
    if (!ok) return;
    deleteGroup(boardId, group.id).catch((error: unknown) => fail(error, 'Could not delete the group'));
  }

  return (
    <header className="ticket-group-head">
      <button
        type="button"
        className={collapsed ? 'ticket-group-caret collapsed' : 'ticket-group-caret'}
        aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        ▾
      </button>
      {editable ? (
        <ColorDot
          color={group.color as SelectColor}
          name={group.name}
          onChange={(color) =>
            patchGroup(boardId, group.id, { color }).catch((error: unknown) => fail(error, 'Could not recolor the group'))
          }
        />
      ) : null}
      {editable && editing ? (
        <input
          className="ticket-group-name-input"
          aria-label="Group name"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setName(group.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <h2 className="ticket-group-name" onDoubleClick={() => editable && setEditing(true)}>
          {group.name}
        </h2>
      )}
      <span className="ticket-group-count">
        {count} ticket{count === 1 ? '' : 's'}
      </span>
      {editable ? (
        <span className="ticket-group-actions">
          <button type="button" className="linkish" onClick={() => setEditing(true)}>
            Rename
          </button>
          {canDelete ? (
            <button type="button" className="linkish danger" onClick={() => void remove()}>
              Delete
            </button>
          ) : null}
        </span>
      ) : null}
    </header>
  );
}
