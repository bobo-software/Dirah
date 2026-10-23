import { useEffect, useId, useState, type DragEvent } from 'react';
import type { PublicMember } from '../../api/members';
import type { Ticket, TicketBoardView, TicketGroup, TicketPatch, TicketStatus } from '../../api/tickets';
import { useTicketStore } from '../../stores/StoresIndex';
import { confirmDelete } from '../layout/deleteDialogue';
import { ColorDot } from '../notes/table/ColorDot';
import type { SelectColor } from '../notes/table/columnTypes';
import { AssigneeCell, DueCell, PriorityCell, StatusCell } from './TicketCells';
import { formatCreated, isFiltering, matchesFilter, partitionDone, type TicketFilters } from './ticketMeta';
import { Button } from '../buttons/Button';

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
  filters,
  onOpen,
  onAdd,
  onError,
}: {
  view: TicketBoardView;
  members: PublicMember[];
  editable: boolean;
  filters: TicketFilters;
  onOpen: (ticket: Ticket) => void;
  onAdd: (defaults: { groupId: string }) => void;
  onError: (message: string) => void;
}) {
  const patchTicket = useTicketStore((state) => state.patchTicket);
  const moveTicket = useTicketStore((state) => state.moveTicket);
  const setDragging = useTicketStore((state) => state.setDragging);
  const createGroup = useTicketStore((state) => state.createGroup);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const boardId = view.board.id;

  // A drag cut short by unmounting must not leave polling paused.
  useEffect(() => () => setDragging(boardId, false), [boardId, setDragging]);
  const filtering = isFiltering(filters);
  const canDrag = editable && !filtering;
  const groups = [...view.groups]
    .filter((group) => !filters.groupIds.length || filters.groupIds.includes(group.id))
    .sort((a, b) => a.position - b.position);
  const doneIds = new Set(view.statuses.filter((status) => status.category === 'done').map((status) => status.id));
  const statusById = new Map(view.statuses.map((status) => [status.id, status]));
  const groupById = new Map(view.groups.map((group) => [group.id, group]));
  const visibleGroupIds = new Set(groups.map((group) => group.id));
  const { done } = partitionDone(
    view.tickets.filter((ticket) => visibleGroupIds.has(ticket.groupId) && matchesFilter(ticket, filters, doneIds)),
    doneIds
  );
  // null = follow the filter: a done status in the status filter opens the section.
  const [doneOpen, setDoneOpen] = useState<boolean | null>(null);
  const doneExpanded = doneOpen ?? filters.statusIds.some((id) => doneIds.has(id));
  const doneTableId = useId();
  const rowProps = {
    statuses: view.statuses,
    statusById,
    members,
    editable,
    doneIds,
    onOpen,
    onPatch: patch,
  };

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
    setDragging(boardId, false);
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
        const rows = all.filter((ticket) => !doneIds.has(ticket.statusId) && matchesFilter(ticket, filters, doneIds));
        const openCount = all.filter((ticket) => !doneIds.has(ticket.statusId)).length;
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
              count={openCount}
              total={all.length}
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
                      <TicketRow
                        key={ticket.id}
                        {...rowProps}
                        ticket={ticket}
                        className={`${dragId === ticket.id ? ' dragging' : ''}${dropClass}`}
                        drag={
                          canDrag
                            ? {
                                onDragStart: (event) => {
                                  event.dataTransfer.setData(ROW_DRAG, ticket.id);
                                  event.dataTransfer.effectAllowed = 'move';
                                  setDragId(ticket.id);
                                  setDragging(boardId, true);
                                },
                                onDragEnd: () => {
                                  setDragId(null);
                                  setDragging(boardId, false);
                                  setDrop(null);
                                },
                                onDragOver: (event) => {
                                  if (!event.dataTransfer.types.includes(ROW_DRAG)) return;
                                  event.preventDefault();
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  const after = event.clientY > rect.top + rect.height / 2;
                                  if (drop?.targetId !== ticket.id || drop.after !== after) {
                                    setDrop({ groupId: group.id, targetId: ticket.id, after });
                                  }
                                },
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                  {rows.length === 0 && (filtering || all.length > 0) ? (
                    <tr className="ticket-row-empty">
                      <td colSpan={7} className="muted">
                        {filtering ? 'No matching tickets.' : 'No open tickets.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {editable ? (
                  <tfoot>
                    <tr>
                      <td className="ticket-col-handle" />
                      <td colSpan={6}>
                        <Button variant="plain" type="button" className="ticket-add-row" onClick={() => onAdd({ groupId: group.id })}>
                          + Add ticket
                        </Button>
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            )}
          </section>
        );
      })}
      {done.length > 0 ? (
        <section className="ticket-done-section" aria-label="Done tickets">
          <header className="ticket-group-head ticket-done-head">
            <Button
              variant="plain"
              type="button"
              className={doneExpanded ? 'ticket-group-caret' : 'ticket-group-caret collapsed'}
              aria-expanded={doneExpanded}
              aria-controls={doneTableId}
              onClick={() => setDoneOpen(!doneExpanded)}
            >
              ▾
            </Button>
            <h2 className="ticket-group-name">
              <Button variant="plain" type="button" className="ticket-done-toggle" onClick={() => setDoneOpen(!doneExpanded)}>
                Done ({done.length})
              </Button>
            </h2>
          </header>
          {doneExpanded ? (
            <table className="ticket-table" id={doneTableId}>
              <tbody>
                {done.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    {...rowProps}
                    ticket={ticket}
                    className=" is-done"
                    groupName={groupById.get(ticket.groupId)?.name}
                  />
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
      {editable ? (
        <Button variant="plain"
          type="button"
          className="ticket-add-group"
          onClick={() =>
            createGroup(boardId, { name: 'New group' }).catch((error: unknown) => fail(error, 'Could not add a group'))
          }
        >
          + Add group
        </Button>
      ) : null}
    </div>
  );
}

type RowDrag = {
  onDragStart: (event: DragEvent<HTMLTableRowElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
};

function TicketRow({
  ticket,
  statuses,
  statusById,
  members,
  editable,
  doneIds,
  className = '',
  groupName,
  drag,
  onOpen,
  onPatch,
}: {
  ticket: Ticket;
  statuses: TicketStatus[];
  statusById: Map<string, TicketStatus>;
  members: PublicMember[];
  editable: boolean;
  doneIds: Set<string>;
  className?: string;
  /** Shown beside the title where rows from several groups are mixed. */
  groupName?: string;
  drag?: RowDrag;
  onOpen: (ticket: Ticket) => void;
  onPatch: (ticket: Ticket, input: TicketPatch) => void;
}) {
  return (
    <tr
      className={`ticket-row${className}`}
      draggable={Boolean(drag)}
      onDragStart={drag?.onDragStart}
      onDragEnd={drag?.onDragEnd}
      onDragOver={drag?.onDragOver}
    >
      <td className="ticket-col-handle">
        {drag ? (
          <span className="ticket-grip" aria-hidden="true">
            ⋮⋮
          </span>
        ) : null}
      </td>
      <td className="ticket-col-title">
        <Button variant="plain" type="button" className="ticket-title-button" onClick={() => onOpen(ticket)}>
          <span className="ticket-title-text">{ticket.title}</span>
          {groupName ? <span className="ticket-done-group">{groupName}</span> : null}
          {ticket.labels.map((label) => (
            <span key={label} className="ticket-label">
              {label}
            </span>
          ))}
        </Button>
      </td>
      <td className="ticket-col-status">
        <StatusCell
          status={statusById.get(ticket.statusId)}
          statuses={statuses}
          editable={editable}
          onChange={(statusId) => onPatch(ticket, { statusId })}
        />
      </td>
      <td className="ticket-col-priority">
        <PriorityCell priority={ticket.priority} editable={editable} onChange={(priority) => onPatch(ticket, { priority })} />
      </td>
      <td className="ticket-col-people">
        <AssigneeCell
          assigneeIds={ticket.assigneeIds}
          members={members}
          editable={editable}
          onChange={(assigneeIds) => onPatch(ticket, { assigneeIds })}
        />
      </td>
      <td className="ticket-col-due">
        <DueCell
          dueDate={ticket.dueDate}
          done={doneIds.has(ticket.statusId)}
          editable={editable}
          onChange={(dueDate) => onPatch(ticket, { dueDate })}
        />
      </td>
      <td className="ticket-col-created">
        <time dateTime={ticket.createdAt} title={new Date(ticket.createdAt).toLocaleString()}>
          {formatCreated(ticket.createdAt)}
        </time>
      </td>
    </tr>
  );
}

function GroupHeader({
  boardId,
  group,
  count,
  total,
  collapsed,
  editable,
  canDelete,
  fallbackName,
  onToggle,
  onError,
}: {
  boardId: string;
  group: TicketGroup;
  /** Open tickets, shown in the header. */
  count: number;
  /** Every ticket in the group, done included; all of them move on delete. */
  total: number;
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
      message: total > 0 ? `Its ${total} ticket${total === 1 ? '' : 's'} will move to “${fallbackName}”.` : 'This group is empty.',
      confirmLabel: 'Delete group',
    });
    if (!ok) return;
    deleteGroup(boardId, group.id).catch((error: unknown) => fail(error, 'Could not delete the group'));
  }

  return (
    <header className="ticket-group-head">
      <Button variant="plain"
        type="button"
        className={collapsed ? 'ticket-group-caret collapsed' : 'ticket-group-caret'}
        aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        ▾
      </Button>
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
          <Button variant="link" type="button" onClick={() => setEditing(true)}>
            Rename
          </Button>
          {canDelete ? (
            <Button variant="link" type="button" className="danger" onClick={() => void remove()}>
              Delete
            </Button>
          ) : null}
        </span>
      ) : null}
    </header>
  );
}
