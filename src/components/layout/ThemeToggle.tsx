import { useTheme, type ThemePreference } from '../../theme/ThemeContext';

const LABELS: Record<ThemePreference, string> = {
  system: 'Matching device theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

const ICONS = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
} satisfies Record<ThemePreference, () => ReturnType<typeof MonitorIcon>>;

export function ThemeToggle() {
  const { preference, cycle } = useTheme();
  const Icon = ICONS[preference];
  const next = NEXT[preference];

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={cycle}
      aria-label={`Theme: ${LABELS[preference]}. Click to switch to ${LABELS[next].toLowerCase()}.`}
      title={LABELS[preference]}
    >
      <Icon />
    </button>
  );
}

export default ThemeToggle;
