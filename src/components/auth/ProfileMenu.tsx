import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SettingsIcon } from '../layout/SectionIcons';
import { useAuthStore } from '../../stores/StoresIndex';
import { THEME_OPTIONS, type ThemePreference, useTheme } from '../../theme/ThemeContext';
import { Button } from '../buttons/Button';

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.5 20c1.2-3.8 4.3-5.7 7.5-5.7s6.3 1.9 7.5 5.7" />
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V7" />
      <path d="M6.5 7.5l.9 12.15a1.5 1.5 0 0 0 1.5 1.35h6.2a1.5 1.5 0 0 0 1.5-1.35l.9-12.15" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6.5V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1.5" />
      <path d="M13 12H3.5M6 8.5 2.5 12 6 15.5" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

const THEME_ICONS: Record<ThemePreference, () => ReturnType<typeof MonitorIcon>> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

export function ProfileMenu() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
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

  const { pathname } = useLocation();
  const workspaceId = pathname.match(/^\/w\/([^/]+)/)?.[1];
  const displayName = user?.name?.trim() ?? '';
  const email = user?.email?.trim() ?? '';
  const initial = (displayName || email).charAt(0).toUpperCase();

  return (
    <div className="profile-menu" ref={containerRef}>
      <Button variant="plain"
        type="button"
        ref={triggerRef}
        className="profile-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={email ? `Account menu, ${email}` : 'Account menu'}
        title={email || undefined}
      >
        {initial ? <span className="profile-trigger-letter" aria-hidden="true">{initial}</span> : <UserIcon />}
        {email ? <span className="profile-trigger-email">{email}</span> : null}
      </Button>
      {open ? (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-identity">
            {displayName ? <p className="profile-dropdown-name">{displayName}</p> : null}
            {user?.role?.trim() ? <p className="profile-dropdown-role">{user.role}</p> : null}
            <p className="profile-dropdown-email">{email}</p>
          </div>
          <div className="profile-dropdown-section">
            <span className="sidebar-label">Theme</span>
            <div className="theme-segmented" role="group" aria-label="Theme">
              {THEME_OPTIONS.map((option) => {
                const Icon = THEME_ICONS[option.value];
                return (
                  <Button variant="plain"
                    key={option.value}
                    type="button"
                    className={preference === option.value ? 'theme-option on' : 'theme-option'}
                    onClick={() => setPreference(option.value)}
                    aria-pressed={preference === option.value}
                  >
                    <Icon />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
          {workspaceId ? (
            <div className="profile-dropdown-section">
              <NavLink
                to={`/w/${workspaceId}/collection`}
                role="menuitem"
                className="profile-menu-item"
                onClick={() => setOpen(false)}
              >
                <CollectionIcon />
                Collection
              </NavLink>
              <NavLink
                to={`/w/${workspaceId}/trash`}
                role="menuitem"
                className="profile-menu-item"
                onClick={() => setOpen(false)}
              >
                <TrashIcon />
                Trash
              </NavLink>
              <NavLink
                to={`/w/${workspaceId}/settings`}
                role="menuitem"
                className="profile-menu-item"
                onClick={() => setOpen(false)}
              >
                <SettingsIcon />
                Settings
              </NavLink>
            </div>
          ) : null}
          <Button variant="plain"
            type="button"
            role="menuitem"
            className="profile-menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
          >
            <UserIcon />
            Account
          </Button>
          <Button variant="plain"
            type="button"
            role="menuitem"
            className="profile-menu-item"
            onClick={() => {
              setOpen(false);
              void logout().then(() => navigate('/'));
            }}
          >
            <LogoutIcon />
            Log out
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default ProfileMenu;
