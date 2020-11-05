import { createContext } from 'react';
import { NotificationsStore } from '@teambit/ui.notifications.store';

const DefaultNotificationApi: NotificationsStore = {
  add: () => '',
  log: () => '',
  error: () => '',
  dismiss: () => {},
  clear: () => {},
};

export const NotificationContext = createContext<NotificationsStore>(DefaultNotificationApi);
