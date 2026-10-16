import { useState, type ChangeEvent } from 'react';

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5 20.5 20" />
      <path d="M10.1 6.8A10 10 0 0 1 12 6.5c5.8 0 9.5 5.5 9.5 5.5a16.8 16.8 0 0 1-3.05 3.45" />
      <path d="M6.2 7.7C4.1 9.1 2.5 12 2.5 12S6.2 17.5 12 17.5c1.15 0 2.22-.22 3.2-.58" />
      <path d="M9.9 10.1a2.6 2.6 0 0 0 3.5 3.7" />
    </svg>
  );
}

export function PasswordField({
  label = 'Password',
  value,
  onChange,
  autoComplete = 'current-password',
  required = true,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label>
      {label}
      <span className="password-field">
        <input
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          required={required}
        />
        <button
          type="button"
          className="icon-btn password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
    </label>
  );
}
