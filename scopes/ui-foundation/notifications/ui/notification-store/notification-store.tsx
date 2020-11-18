export type MessageId = string;

export type NotificationsStore = {
  add: (message: string, level: MessageLevel) => MessageId;
  log: (message: string) => MessageId;
  error: (message: string) => MessageId;
  dismiss: (id: string) => void;
  clear: () => void;
};

export enum MessageLevel {
  error = 'error',
  warning = 'warning',
  success = 'success',
  info = 'info',
  // debug,
}

export type Message = {
  id: MessageId;
  message: string;
  level: MessageLevel;
  time: string;
};
