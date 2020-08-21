import React, { ReactNode } from 'react';
import { Theme } from '@teambit/base-ui-temp.theme.theme-provider';

import { useLoaderApi, LoaderContext, LoaderRibbon } from './global-loader';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();

  return (
    <React.StrictMode>
      <LoaderContext.Provider value={loaderApi}>
        <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
        <Theme>
          <LoaderRibbon active={isLoading} />
          {children}
        </Theme>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
