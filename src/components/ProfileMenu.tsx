import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useTheme, type ThemePreference } from '../theme/ThemeContext';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.5 20c1.2-3.8 4.3-5.7 7.5-5.7s6.3 1.9 7.5 5.7" />
    </svg>
  );
}

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initial = user?.email?.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="profile-menu" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="profile-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {initial !== '?' ? initial : <UserIcon />}
      </button>
      {open ? (
        <div className="profile-dropdown" role="menu">
          <p className="profile-dropdown-email">{user?.email}</p>
          <div className="profile-dropdown-section">
            <span className="sidebar-label">Theme</span>
            <div className="theme-segmented" role="group" aria-label="Theme">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preference === option.value ? 'theme-option on' : 'theme-option'}
                  onClick={() => setPreference(option.value)}
                  aria-pressed={preference === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="profile-menu-item"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ProfileMenu;
