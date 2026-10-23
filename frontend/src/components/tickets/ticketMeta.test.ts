import { describe, expect, it } from 'vitest';
import type { Ticket } from '../../api/tickets';
import { NO_FILTERS, matchesFilter, partitionDone } from './ticketMeta';

const DONE = 'status-done';
const OPEN = 'status-open';
const doneIds = new Set([DONE]);

function ticket(id: string, statusId: string, updatedAt: string, title = id): Ticket {
  return {
    id,
    boardId: 'board',
    key: `DIRA-${id}`,
    number: 1,
    groupId: 'group',
    statusId,
    title,
    description: '',
    priority: 'none',
    dueDate: null,
    labels: [],
    position: 0,
    statusPosition: 0,
    assigneeIds: [],
    createdBy: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
  };
}

describe('partitionDone', () => {
  const tickets = [
    ticket('1', OPEN, '2026-10-02T00:00:00.000Z'),
    ticket('2', DONE, '2026-10-03T00:00:00.000Z', 'Ship invites'),
    ticket('3', DONE, '2026-10-05T00:00:00.000Z', 'Fix login'),
    ticket('4', OPEN, '2026-10-04T00:00:00.000Z'),
  ];

  it('splits on done statuses and keeps open order', () => {
    const { open, done } = partitionDone(tickets, doneIds);
    expect(open.map((item) => item.id)).toEqual(['1', '4']);
    expect(done.map((item) => item.id).sort()).toEqual(['2', '3']);
  });

  it('puts the most recently updated done ticket first', () => {
    expect(partitionDone(tickets, doneIds).done.map((item) => item.id)).toEqual(['3', '2']);
  });

  it('counts only done tickets that match the filters', () => {
    const filters = { ...NO_FILTERS, text: 'login' };
    const { done } = partitionDone(
      tickets.filter((item) => matchesFilter(item, filters, doneIds)),
      doneIds
    );
    expect(done.map((item) => item.id)).toEqual(['3']);
  });
});
