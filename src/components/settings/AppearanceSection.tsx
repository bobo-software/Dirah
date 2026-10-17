import { THEME_OPTIONS, useTheme } from '../../theme/ThemeContext';
import { Button } from '../buttons/Button';

export function AppearanceSection() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="settings-section">
      <h2>Appearance</h2>
      <p className="muted">Choose how Dirah looks on this device.</p>
      <div className="theme-segmented settings-theme-segmented" role="group" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <Button variant="plain"
            key={option.value}
            type="button"
            className={preference === option.value ? 'theme-option on' : 'theme-option'}
            onClick={() => setPreference(option.value)}
            aria-pressed={preference === option.value}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
