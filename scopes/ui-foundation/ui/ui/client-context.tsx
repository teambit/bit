import type { ReactNode } from 'react';
import React from 'react';
import { IconFont } from '@teambit/design.theme.icons-font';
import { LoaderRibbon } from '@teambit/base-ui.loaders.loader-ribbon';
import { Roboto } from '@teambit/base-ui.theme.fonts.roboto';
import { TooltipMountPoint } from '@teambit/design.ui.tooltip';

import { LoaderContext, useLoaderApi } from '@teambit/ui-foundation.ui.global-loader';
import { StableThemeSwitcher } from './stable-theme-switcher';
import styles from './client-context.module.scss';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();

  return (
    <React.StrictMode>
      {/* TODO - try moving LoaderContext to contextSlot, and LoaderRibbon to hudSlot */}
      <LoaderContext.Provider value={loaderApi}>
        <IconFont query="c7vhhb" />
        <StableThemeSwitcher>
          <Roboto />
          <LoaderRibbon active={isLoading} className={styles.loader} />
          {children}
          <TooltipMountPoint />
        </StableThemeSwitcher>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
