import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { BaseTheme } from '@teambit/design.themes.base-theme';
import type { BaseThemeSchema } from '@teambit/design.themes.base-theme';
import { darkThemeValues, DarkTheme } from '@teambit/design.themes.dark-theme';
import { ThemePickerContext } from '@teambit/base-react.themes.theme-switcher';
import type { ThemeOption, ThemePicker } from '@teambit/base-react.themes.theme-switcher';
import { LightTheme } from '@teambit/design.themes.light-theme';

// These must match the overrides each theme component passes to BaseTheme.
// LightTheme passes these 3 overrides; DarkTheme passes darkThemeValues.
const lightOverrides: Partial<BaseThemeSchema> = {
  backgroundColor: '#fdfdff',
  surface01Color: '#f7f7f7',
  warningColor: '#BB8C25',
};

const themeOverridesMap: Record<string, Partial<BaseThemeSchema>> = {
  light: lightOverrides,
  dark: darkThemeValues,
};

const themes: ThemeOption[] = [LightTheme, DarkTheme];

export type StableThemeSwitcherProps = {
  children?: ReactNode;
  defaultTheme?: string;
};

/**
 * A stable theme switcher that does NOT swap React component types on theme change.
 * Instead, it renders a single stable <BaseTheme> and only changes the CSS variable
 * overrides, preventing the entire React tree from unmounting and remounting.
 */
export function StableThemeSwitcher({ children, defaultTheme }: StableThemeSwitcherProps) {
  const getInitialTheme = useCallback(
    () => (defaultTheme && themes.find((t) => t.themeName === defaultTheme)) || themes[0],
    [defaultTheme]
  );

  const [theme, setThemeState] = useState<ThemeOption>(getInitialTheme);

  useEffect(() => {
    setThemeState(getInitialTheme);
  }, [getInitialTheme]);

  const setTheme = useCallback((option: ThemeOption) => {
    setThemeState(() => option);
  }, []);

  const picker: ThemePicker = useMemo(
    () => ({
      current: theme,
      get currentIdx() {
        return themes.indexOf(theme);
      },
      options: themes,
      setTheme,
    }),
    [theme, setTheme]
  );

  const overrides = themeOverridesMap[theme.themeName || 'light'];

  return (
    <ThemePickerContext.Provider value={picker}>
      <BaseTheme overrides={overrides}>{children}</BaseTheme>
    </ThemePickerContext.Provider>
  );
}
