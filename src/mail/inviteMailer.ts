import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { db } from '../db';
import { emailLogs } from '../db/schemas';
import {
  buildInviteEmailHtml,
  buildInviteEmailText,
  type InviteEmailContent,
} from './templates/inviteEmail';

async function recordEmailLog(opts: {
  to: string;
  subject: string;
  kind: string;
  success: boolean;
  error?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(emailLogs).values({
      id: randomUUID(),
      to: opts.to,
      subject: opts.subject,
      kind: opts.kind,
      success: opts.success,
      error: opts.error ?? null,
      meta: opts.meta ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to write email log', error);
  }
}

export async function sendInviteEmail(opts: InviteEmailContent): Promise<boolean> {
  const subject = `Join ${opts.workspaceName} on Dira`;
  const meta = {
    workspaceName: opts.workspaceName,
    role: opts.role,
    invitedByEmail: opts.invitedByEmail,
  };

  if (!env.smtpConfigured) {
    await recordEmailLog({
      to: opts.to,
      subject,
      kind: 'workspace_invite',
      success: false,
      error: 'SMTP not configured',
      meta,
    });
    return false;
  }

  try {
    const nodeRequire = createRequire(__filename);
    const nodemailer = nodeRequire('nodemailer') as {
      createTransport: (options: {
        host: string;
        port: number;
        secure: boolean;
        auth?: { user: string; pass: string };
      }) => {
        sendMail: (mail: {
          from: string;
          to: string;
          subject: string;
          text: string;
          html: string;
        }) => Promise<unknown>;
      };
    };
    const { host, port, secure, user, password, from } = env.smtp;
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass: password } } : {}),
    });
    await transport.sendMail({
      from,
      to: opts.to,
      subject,
      text: buildInviteEmailText(opts),
      html: buildInviteEmailHtml(opts),
    });
    await recordEmailLog({
      to: opts.to,
      subject,
      kind: 'workspace_invite',
      success: true,
      meta,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Invite email failed:', error);
    await recordEmailLog({
      to: opts.to,
      subject,
      kind: 'workspace_invite',
      success: false,
      error: message,
      meta,
    });
    return false;
  }
}
