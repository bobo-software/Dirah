import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { inArray } from 'drizzle-orm';
import { createApp } from '../app';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { emailLogs } from '../db/schemas';

const stamp = Date.now();
const password = 'password12';
const email = (label: string) => `ticket-mail-${label}-${stamp}@example.com`;

describe('ticket email API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping ticket email API tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  async function register(label: string) {
    const res = await request(app).post('/api/auth/register').send({ email: email(label), password, name: label });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      userId: res.body.data.user.id as string,
      workspaceId: res.body.data.workspace.id as string,
    };
  }

  async function mail() {
    const rows = await db
      .select({ to: emailLogs.to, kind: emailLogs.kind, error: emailLogs.error, meta: emailLogs.meta })
      .from(emailLogs)
      .where(inArray(emailLogs.to, [email('owner'), email('editor'), email('viewer')]));
    return rows.filter((row) => row.kind.startsWith('ticket_'));
  }

  it('emails the other people on a ticket, never the actor', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await register('owner');
    const editor = await register('editor');
    const workspaceId = owner.workspaceId;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    const invite = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set(as(owner.token))
      .send({ email: email('editor'), role: 'editor' });
    const inviteToken = String(invite.body.data.invite.inviteUrl).split('/invite/')[1];
    expect((await request(app).post(`/api/invites/${inviteToken}/accept`).set(as(editor.token)).send({})).status).toBe(
      201
    );

    const board = await request(app)
      .post(`/api/workspaces/${workspaceId}/ticket-boards`)
      .set(as(owner.token))
      .send({ name: 'Mail', key: 'MAIL' });
    expect(board.status).toBe(201);
    const boardId = board.body.data.board.id as string;
    const status = (name: string) =>
      (board.body.data.statuses as { id: string; name: string }[]).find((item) => item.name === name)!.id;

    // Assigning on create emails the editor once, not the owner who did it.
    const created = await request(app)
      .post(`/api/ticket-boards/${boardId}/tickets`)
      .set(as(owner.token))
      .send({ title: 'Ship it', assigneeIds: [editor.userId, owner.userId] });
    expect(created.status).toBe(201);
    const ticketId = created.body.data.ticket.id as string;
    let sent = await mail();
    expect(sent.map((row) => [row.to, row.kind])).toEqual([[email('editor'), 'ticket_assigned']]);
    expect(sent[0].error).toBe('SMTP not configured');
    expect((sent[0].meta as { ticketUrl: string }).ticketUrl).toMatch(
      new RegExp(`/w/${workspaceId}/tickets/${boardId}\\?ticket=MAIL-1$`)
    );

    // Re-sending the same assignees is not a new assignment.
    await request(app).patch(`/api/tickets/${ticketId}`).set(as(owner.token)).send({ assigneeIds: [editor.userId, owner.userId] });
    expect(await mail()).toHaveLength(1);

    // A comment emails assignees and the creator, minus the commenter.
    const comment = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set(as(editor.token))
      .send({ body: 'On it' });
    expect(comment.status).toBe(201);
    sent = await mail();
    expect(sent.filter((row) => row.kind === 'ticket_comment').map((row) => row.to)).toEqual([email('owner')]);

    // Moves within todo/doing are quiet.
    expect(
      (await request(app).patch(`/api/tickets/${ticketId}`).set(as(owner.token)).send({ statusId: status('In progress') }))
        .status
    ).toBe(200);
    expect(
      (await request(app).patch(`/api/tickets/${ticketId}`).set(as(owner.token)).send({ statusId: status('Blocked') }))
        .status
    ).toBe(200);
    expect((await mail()).filter((row) => row.kind === 'ticket_status')).toHaveLength(0);

    // Into done (patch) and back out of done (drag) both email the assignee.
    expect(
      (await request(app).patch(`/api/tickets/${ticketId}`).set(as(owner.token)).send({ statusId: status('Done') })).status
    ).toBe(200);
    const moved = await request(app)
      .put(`/api/tickets/${ticketId}/move`)
      .set(as(owner.token))
      .send({ statusId: status('To do'), statusPosition: 0 });
    expect(moved.status).toBe(200);
    sent = await mail();
    expect(sent.filter((row) => row.kind === 'ticket_status').map((row) => row.to)).toEqual([
      email('editor'),
      email('editor'),
    ]);
    expect(sent.some((row) => row.to === email('owner') && row.kind !== 'ticket_comment')).toBe(false);
  });
});
