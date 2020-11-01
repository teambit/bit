import { Theme } from '@teambit/base-ui.theme.theme-provider';
import { EvaIconFont } from '@teambit/evangelist.theme.icon-font';
import React, { ReactNode } from 'react';

import { LoaderContext, LoaderRibbon, useLoaderApi } from './global-loader';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();

  return (
    <React.StrictMode>
      <LoaderContext.Provider value={loaderApi}>
        <EvaIconFont query="av92bs" />
        <Theme>
          <LoaderRibbon active={isLoading} />
          {children}
        </Theme>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
