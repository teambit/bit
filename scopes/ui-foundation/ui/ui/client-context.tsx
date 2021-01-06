import { Theme } from '@teambit/base-ui.theme.theme-provider';
import { EvaIconFont } from '@teambit/evangelist.theme.icon-font';
import { LoaderRibbon } from '@teambit/base-ui.loaders.loader-ribbon';
import React, { ReactNode } from 'react';

import { LoaderContext, useLoaderApi } from '@teambit/ui.global-loader';
import styles from './client-context.module.scss';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();

  return (
    <React.StrictMode>
      {/* TODO - try moving LoaderContext to contextSlot, and LoaderRibbon to hudSlot */}
      <LoaderContext.Provider value={loaderApi}>
        <EvaIconFont query="mxd7i0" />
        <Theme>
          <LoaderRibbon active={isLoading} className={styles.loader} />
          {children}
        </Theme>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
