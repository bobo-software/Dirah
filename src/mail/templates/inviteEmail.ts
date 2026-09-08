function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type InviteEmailContent = {
  to: string;
  workspaceName: string;
  role: string;
  inviteUrl: string;
  invitedByEmail: string;
};

export function buildInviteEmailText(opts: InviteEmailContent): string {
  return [
    `${opts.invitedByEmail} invited you to ${opts.workspaceName} on Dira as ${opts.role}.`,
    '',
    'Open this link to review the invite and create an account or sign in:',
    opts.inviteUrl,
    '',
    'This link expires in 7 days.',
    '',
    'If you did not expect this invitation, you can ignore this email.',
  ].join('\n');
}

export function buildInviteEmailHtml(opts: InviteEmailContent): string {
  const workspaceName = escapeHtml(opts.workspaceName);
  const role = escapeHtml(opts.role);
  const invitedByEmail = escapeHtml(opts.invitedByEmail);
  const inviteUrl = escapeHtml(opts.inviteUrl);
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Join ${workspaceName} on Dira</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ef;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f2ef;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fffcf8;border:1px solid #e2ddd6;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #e2ddd6;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;color:#2f5d50;letter-spacing:0.02em;">
                Dira
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.4;color:#6b6573;text-transform:uppercase;letter-spacing:0.06em;">
                Workspace invitation
              </p>
              <h1 style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:1.3;font-weight:600;color:#141218;">
                You’re invited to ${workspaceName}
              </h1>
              <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#3d3a44;">
                <strong style="color:#141218;">${invitedByEmail}</strong>
                invited you to join
                <strong style="color:#141218;">${workspaceName}</strong>
                on Dira as
                <strong style="color:#141218;">${role}</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:#2f5d50;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;">
                      Review invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b6573;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.5;color:#2f5d50;word-break:break-all;">
                <a href="${inviteUrl}" style="color:#2f5d50;text-decoration:underline;">${inviteUrl}</a>
              </p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b6573;">
                This invitation expires in 7 days. If you weren’t expecting it, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f8f5f1;border-top:1px solid #e2ddd6;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#948e9c;">
                © ${year} Dira · Sent to ${escapeHtml(opts.to)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
