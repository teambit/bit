import { createContext } from 'react';
import { MessageId, MessageLevel, NotificationApi } from '../../notification-api';

export type Message = {
  id: MessageId;
  message: string;
  level: MessageLevel;
  time: string;
};

const defaultLoaderApi: NotificationApi = {
  add: () => '',
  log: () => '',
  error: () => '',
  dismiss: () => {},
};

export const NotificationContext = createContext<NotificationApi>(defaultLoaderApi);
