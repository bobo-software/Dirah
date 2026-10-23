function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type TicketEmailKind = 'assigned' | 'comment' | 'status';

export type TicketEmailContent = {
  to: string;
  kind: TicketEmailKind;
  actorName: string;
  workspaceName: string;
  ticketKey: string;
  ticketTitle: string;
  ticketUrl: string;
  /** Comment body, for `comment`. */
  comment?: string;
  /** New status name, for `status`. */
  statusName?: string;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function ticketEmailSubject(opts: TicketEmailContent): string {
  const ref = `${opts.ticketKey} ${opts.ticketTitle}`;
  if (opts.kind === 'assigned') return `${opts.actorName} assigned you ${ref}`;
  if (opts.kind === 'comment') return `${opts.actorName} commented on ${ref}`;
  return `${opts.ticketKey} moved to ${opts.statusName ?? 'a new status'}: ${opts.ticketTitle}`;
}

function headline(opts: TicketEmailContent): string {
  if (opts.kind === 'assigned') return `${opts.actorName} assigned you a ticket in ${opts.workspaceName}.`;
  if (opts.kind === 'comment') return `${opts.actorName} commented on a ticket in ${opts.workspaceName}.`;
  return `${opts.actorName} moved a ticket to ${opts.statusName ?? 'a new status'} in ${opts.workspaceName}.`;
}

export function buildTicketEmailText(opts: TicketEmailContent): string {
  const lines = [headline(opts), '', `${opts.ticketKey}  ${opts.ticketTitle}`];
  if (opts.kind === 'comment' && opts.comment) {
    lines.push('', opts.comment);
  }
  lines.push('', 'Open the ticket:', opts.ticketUrl);
  return lines.join('\n');
}

export function buildTicketEmailHtml(opts: TicketEmailContent): string {
  const ticketUrl = escapeHtml(opts.ticketUrl);
  const year = new Date().getFullYear();
  const quote =
    opts.kind === 'comment' && opts.comment
      ? `<p style="margin:0 0 24px;padding:12px 16px;border-left:3px solid #e2ddd6;font-family:${FONT};font-size:15px;line-height:1.55;color:#3d3a44;white-space:pre-wrap;">${escapeHtml(opts.comment)}</p>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(ticketEmailSubject(opts))}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ef;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f2ef;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fffcf8;border:1px solid #e2ddd6;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #e2ddd6;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;color:#2f5d50;letter-spacing:0.02em;">
                Dirah
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.4;color:#6b6573;text-transform:uppercase;letter-spacing:0.06em;">
                ${escapeHtml(opts.ticketKey)}
              </p>
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:600;color:#141218;">
                ${escapeHtml(opts.ticketTitle)}
              </h1>
              <p style="margin:0 0 24px;font-family:${FONT};font-size:16px;line-height:1.55;color:#3d3a44;">
                ${escapeHtml(headline(opts))}
              </p>
              ${quote}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
                <tr>
                  <td style="border-radius:8px;background:#2f5d50;">
                    <a href="${ticketUrl}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;">
                      Open ticket
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f8f5f1;border-top:1px solid #e2ddd6;">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:#948e9c;">
                © ${year} Dirah · Sent to ${escapeHtml(opts.to)}
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
