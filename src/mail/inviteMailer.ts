import { createRequire } from 'node:module';
import { env } from '../config/env';

export async function sendInviteEmail(opts: {
  to: string;
  workspaceName: string;
  role: string;
  inviteUrl: string;
}): Promise<boolean> {
  const smtpUrl = env.smtpUrl.trim();
  if (!smtpUrl) {
    return false;
  }
  try {
    const nodeRequire = createRequire(__filename);
    const nodemailer = nodeRequire('nodemailer') as {
      createTransport: (url: string) => {
        sendMail: (mail: {
          from: string;
          to: string;
          subject: string;
          text: string;
        }) => Promise<unknown>;
      };
    };
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from: env.smtpFrom,
      to: opts.to,
      subject: `Join ${opts.workspaceName} on Dira`,
      text: [
        `You've been invited as ${opts.role} to ${opts.workspaceName}.`,
        '',
        opts.inviteUrl,
        '',
        'This link expires in 7 days.',
      ].join('\n'),
    });
    return true;
  } catch (error) {
    console.warn('Invite email failed:', error);
    return false;
  }
}
