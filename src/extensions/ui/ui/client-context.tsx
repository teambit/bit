import React, { ReactNode } from 'react';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';

import { useLoaderApi, LoaderContext, LoaderRibbon } from './global-loader';
import { useNotifications, NotificationContext } from '../../notifications/ui';
import { NotificationCenter } from '../../notifications/ui/notification-center';

export function ClientContext({ children }: { children: ReactNode }) {
  const [loaderApi, isLoading] = useLoaderApi();
  const [notificationApi, notifications] = useNotifications();

  return (
    <React.StrictMode>
      <LoaderContext.Provider value={loaderApi}>
        <NotificationContext.Provider value={notificationApi}>
          <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
          <Theme>
            <LoaderRibbon active={isLoading} />
            {/* TODO - before slot */}
            {children}
            {/* TODO - after slot */}
            <NotificationCenter notifications={notifications} />
          </Theme>
        </NotificationContext.Provider>
      </LoaderContext.Provider>
    </React.StrictMode>
  );
}
