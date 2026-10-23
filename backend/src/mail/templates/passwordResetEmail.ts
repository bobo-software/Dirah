export function buildPasswordResetText(code: string): string {
  return [
    `Your Dirah password reset code is ${code}.`,
    '',
    'It expires in 10 minutes. If you did not ask to reset your password, you can ignore this email.',
  ].join('\n');
}

export function buildPasswordResetHtml(code: string): string {
  const safe = code.replace(/[^0-9]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<body>
  <p>Your Dirah password reset code is <strong>${safe}</strong>.</p>
  <p>It expires in 10 minutes. If you did not ask to reset your password, you can ignore this email.</p>
</body>
</html>`;
}
