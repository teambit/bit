import React, { ReactNode } from 'react';
import { Theme } from '@teambit/base-ui.theme.theme-provider';
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
        <IconFont query="cr084i" />
        <Theme>
          <Roboto />
          <LoaderRibbon active={isLoading} className={styles.loader} />
          {children}
          <TooltipMountPoint />
        </Theme>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
