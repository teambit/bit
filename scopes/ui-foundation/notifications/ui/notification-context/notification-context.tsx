import { createContext } from 'react';
import { NotificationApi } from '@teambit/ui.notifications.api';

const defaultLoaderApi: NotificationApi = {
  add: () => '',
  log: () => '',
  error: () => '',
  dismiss: () => {},
  clear: () => {},
};

export const NotificationContext = createContext<NotificationApi>(defaultLoaderApi);
