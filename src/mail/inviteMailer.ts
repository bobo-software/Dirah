import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { db } from '../db';
import { emailLogs } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import {
  buildInviteEmailHtml,
  buildInviteEmailText,
  type InviteEmailContent,
} from './templates/inviteEmail';
import { buildPasswordResetHtml, buildPasswordResetText } from './templates/passwordResetEmail';
import { buildTestEmailHtml, buildTestEmailText } from './templates/testEmail';

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

type Delivery = { ok: true } | { ok: false; error: string };

function mailError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createTransport() {
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
  const { host, port, secure, user, password } = env.smtp;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass: password } } : {}),
  });
}

async function deliver(opts: {
  to: string;
  subject: string;
  kind: string;
  text: string;
  html: string;
  meta?: Record<string, unknown> | null;
}): Promise<Delivery> {
  const meta = opts.meta ?? null;
  if (!env.smtpConfigured) {
    await recordEmailLog({
      to: opts.to,
      subject: opts.subject,
      kind: opts.kind,
      success: false,
      error: 'SMTP not configured',
      meta,
    });
    return { ok: false, error: 'SMTP not configured' };
  }

  try {
    await createTransport().sendMail({
      from: env.smtp.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    await recordEmailLog({
      to: opts.to,
      subject: opts.subject,
      kind: opts.kind,
      success: true,
      meta,
    });
    return { ok: true };
  } catch (error) {
    const message = mailError(error);
    console.warn(`${opts.kind} email failed:`, error);
    await recordEmailLog({
      to: opts.to,
      subject: opts.subject,
      kind: opts.kind,
      success: false,
      error: message,
      meta,
    });
    return { ok: false, error: message };
  }
}

export async function sendInviteEmail(opts: InviteEmailContent): Promise<boolean> {
  const result = await deliver({
    to: opts.to,
    subject: `Join ${opts.workspaceName} on Dirah`,
    kind: 'workspace_invite',
    text: buildInviteEmailText(opts),
    html: buildInviteEmailHtml(opts),
    meta: {
      workspaceName: opts.workspaceName,
      role: opts.role,
      invitedByEmail: opts.invitedByEmail,
    },
  });
  return result.ok;
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<boolean> {
  if (!env.smtpConfigured && env.nodeEnv === 'development') {
    console.info(`Password reset code for ${to}: ${code}`);
  }
  const result = await deliver({
    to,
    subject: 'Your Dirah password reset code',
    kind: 'password_reset',
    text: buildPasswordResetText(code),
    html: buildPasswordResetHtml(code),
    meta: { purpose: 'password_reset' },
  });
  if (!env.smtpConfigured) return env.nodeEnv !== 'production';
  return result.ok;
}

export async function sendTestEmail(to: string): Promise<void> {
  const result = await deliver({
    to,
    subject: 'Dirah test email',
    kind: 'test',
    text: buildTestEmailText(),
    html: buildTestEmailHtml(),
    meta: { purpose: 'smtp_test' },
  });
  if (result.ok) return;
  if (result.error === 'SMTP not configured') {
    throw new HttpError('SMTP is not configured', 503, 'EMAIL_UNAVAILABLE');
  }
  throw new HttpError(`Could not send the test email: ${result.error}`, 502, 'SMTP_FAILED');
}
