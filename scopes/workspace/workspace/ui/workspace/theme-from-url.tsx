import { useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useThemePicker } from '@teambit/base-react.themes.theme-switcher';

const STORAGE_KEY = 'workspace-theme';
const CLEAR_VALUES = new Set(['default', 'none', '']);

let lastUrlWrite: string | null = null;
let lastSeenUrlTheme: string | undefined = undefined;
let lastAppliedFromUrl: string | null = null;

export function ThemeFromUrlSync() {
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const theme = useThemePicker();

  const urlTheme = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('theme') ?? undefined;
  }, [location.search]);

  const currentName = theme?.current?.themeName;

  useEffect(() => {
    if (!theme) return;

    const params = new URLSearchParams(location.search);
    const hasThemeParam = params.has('theme');
    const storedTheme = sessionStorage.getItem(STORAGE_KEY) || undefined;

    if (lastUrlWrite && lastUrlWrite === urlTheme) {
      lastUrlWrite = null;
      lastSeenUrlTheme = urlTheme;
      return;
    }

    const externalUrlChange = lastSeenUrlTheme !== urlTheme;
    lastSeenUrlTheme = urlTheme;

    if (externalUrlChange && hasThemeParam && urlTheme && CLEAR_VALUES.has(urlTheme)) {
      sessionStorage.removeItem(STORAGE_KEY);
      params.delete('theme');
      lastUrlWrite = null;
      lastAppliedFromUrl = null;
      setSearchParams(params, { replace: true });
      return;
    }

    if (externalUrlChange && urlTheme) {
      sessionStorage.setItem(STORAGE_KEY, urlTheme);

      if (currentName !== urlTheme) {
        const target = theme.options.find((opt) => opt.themeName === urlTheme);
        if (target) {
          lastAppliedFromUrl = urlTheme;
          theme.setTheme(target);
        }
      }
      return;
    }

    if (externalUrlChange && !hasThemeParam && storedTheme) {
      params.set('theme', storedTheme);
      lastUrlWrite = storedTheme;
      setSearchParams(params, { replace: true });
      return;
    }

    if (currentName && urlTheme !== currentName) {
      if (lastAppliedFromUrl === currentName) {
        lastAppliedFromUrl = null;
        return;
      }

      sessionStorage.setItem(STORAGE_KEY, currentName);
      params.set('theme', currentName);
      lastUrlWrite = currentName;
      setSearchParams(params, { replace: true });
    }
  }, [urlTheme, currentName, location.search, setSearchParams, theme]);

  return null;
}
