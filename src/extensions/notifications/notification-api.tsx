export type MessageId = string;

export type NotificationApi = {
  add: (message: string, level: MessageLevel) => MessageId;
  log: (message: string) => MessageId;
  error: (message: string) => MessageId;
  dismiss: (id: string) => void;
};

export enum MessageLevel {
  error = 'error',
  warning = 'warning',
  success = 'success',
  info = 'info',
  // debug,
}
