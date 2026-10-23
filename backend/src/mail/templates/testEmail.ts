export function buildTestEmailText(): string {
  return ['This is a test email from Dirah.', '', 'SMTP is working.'].join('\n');
}

export function buildTestEmailHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<body>
  <p>This is a test email from Dirah.</p>
  <p>SMTP is working.</p>
</body>
</html>`;
}
