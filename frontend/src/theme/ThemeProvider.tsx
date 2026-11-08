import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type ResolvedTheme, type ThemePreference } from './ThemeContext';

const STORAGE_KEY = 'dirah.theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(preference: ThemePreference, resolved: ResolvedTheme): void {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#17161b' : '#f4f2ef');
}

/**
 * Preference is persisted in localStorage. Leaving it unset ("system") means
 * the theme tracks the OS setting via the `prefers-color-scheme` media query
 * in index.css with no JS involved, so it stays live even if this listener
 * doesn't fire (e.g. before hydration).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());
  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      if (pref === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, pref);
      }
    } catch {
      // localStorage unavailable; preference just won't survive a reload.
    }
  }, []);

  const cycle = useCallback(() => {
    setPreference(preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system');
  }, [preference, setPreference]);

  useEffect(() => {
    applyTheme(preference, resolved);
  }, [preference, resolved]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, cycle }),
    [preference, resolved, setPreference, cycle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
