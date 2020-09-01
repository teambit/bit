import { createContext } from 'react';

import { NotificationApi } from '@teambit/organism.notifications.api';

const defaultLoaderApi: NotificationApi = {
  add: () => '',
  log: () => '',
  error: () => '',
  dismiss: () => {},
};

export const NotificationContext = createContext<NotificationApi>(defaultLoaderApi);
