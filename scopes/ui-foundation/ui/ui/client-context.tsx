import React, { ReactNode } from 'react';
import { ThemeSwitcher } from '@teambit/design.themes.theme-toggler';
import { useLocalStorage } from '@teambit/community.ui.hooks.use-local-storage';
import { IconFont } from '@teambit/design.theme.icons-font';
import { LoaderRibbon } from '@teambit/base-ui.loaders.loader-ribbon';
import { Roboto } from '@teambit/base-ui.theme.fonts.roboto';
import { TooltipMountPoint } from '@teambit/design.ui.tooltip';

import { LoaderContext, useLoaderApi } from '@teambit/ui-foundation.ui.global-loader';
import styles from './client-context.module.scss';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();
  const [theme, setTheme] = useLocalStorage('theme', 'light');

  return (
    <React.StrictMode>
      {/* TODO - try moving LoaderContext to contextSlot, and LoaderRibbon to hudSlot */}
      <LoaderContext.Provider value={loaderApi}>
        <IconFont query="c7vhhb" />
        <ThemeSwitcher activeTheme={theme} handleThemeChange={(t) => setTheme(t.themeName)}>
          <Roboto />
          <LoaderRibbon active={isLoading} className={styles.loader} />
          {children}
          <TooltipMountPoint />
        </ThemeSwitcher>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
