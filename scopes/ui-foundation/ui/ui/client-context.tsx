import { Theme } from '@teambit/base-ui.theme.theme-provider';
import { EvaIconFont } from '@teambit/evangelist.theme.icon-font';
import { Roboto } from '@teambit/base-ui.theme.fonts.roboto';
import React, { ReactNode } from 'react';

import { LoaderContext, LoaderRibbon, useLoaderApi } from './global-loader';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();

  return (
    <React.StrictMode>
      <LoaderContext.Provider value={loaderApi}>
        <EvaIconFont query="mxd7i0" />
        <Theme>
          <Roboto />
          <LoaderRibbon active={isLoading} />
          {children}
        </Theme>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
