import React, { ReactNode } from 'react';
// import { Theme } from '@teambit/base-ui.theme.theme-provider';
import { ThemeSwitcher } from '@teambit/design.themes.theme-toggler';
import { IconFont } from '@teambit/design.theme.icons-font';
import { LoaderRibbon } from '@teambit/base-ui.loaders.loader-ribbon';
import { Roboto } from '@teambit/base-ui.theme.fonts.roboto';
import { TooltipMountPoint } from '@teambit/design.ui.tooltip';

import { LoaderContext, useLoaderApi } from '@teambit/ui-foundation.ui.global-loader';
import styles from './client-context.module.scss';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();

  return (
    <React.StrictMode>
      {/* TODO - try moving LoaderContext to contextSlot, and LoaderRibbon to hudSlot */}
      <LoaderContext.Provider value={loaderApi}>
        <IconFont query="q76y7n" />
        <ThemeSwitcher>
          <Roboto />
          <LoaderRibbon active={isLoading} className={styles.loader} />
          {children}
          <TooltipMountPoint />
        </ThemeSwitcher>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
