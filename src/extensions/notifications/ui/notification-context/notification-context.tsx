import { createContext } from 'react';

type MessageId = string;

export type Message = {
  id: MessageId;
  message: string;
  level: MessageLevel;
  time: string;
};

export enum MessageLevel {
  error = 'error',
  warning = 'warning',
  success = 'success',
  info = 'info'
  // debug,
}

export type NotificationApi = {
  add: (message: string, level: MessageLevel) => MessageId;
  log: (message: string) => MessageId;
  error: (message: string) => MessageId;
  dismiss: (id: string) => void;
};

const defaultLoaderApi: NotificationApi = {
  add: () => '',
  log: () => '',
  error: () => '',
  dismiss: () => {}
};

export const NotificationContext = createContext<NotificationApi>(defaultLoaderApi);
