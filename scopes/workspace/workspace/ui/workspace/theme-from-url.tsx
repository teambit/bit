import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useThemePicker } from '@teambit/base-react.themes.theme-switcher';

export function ThemeFromUrlSync() {
  const location = useLocation();
  const theme = useThemePicker();

  const themeFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('theme') || undefined;
  }, [location.search]);

  useEffect(() => {
    if (!themeFromUrl || !theme) return;

    const target = theme.options.find((t) => t.themeName === themeFromUrl);
    if (!target || theme.current === target) return;

    theme.setTheme(target);
  }, [themeFromUrl, theme]);

  return null;
}
