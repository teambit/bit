import { Message } from './ui/notification-context';

export type NotificationAction = {
  type: 'add' | 'dismiss';
  content?: Message;
  id?: string;
};

export function notificationReducer(state: Message[], action: NotificationAction) {
  switch (action.type) {
    case 'dismiss':
      return state.filter((x) => x.id !== action.id);
    case 'add':
      if (!action.content) return state;
      return state.concat(action.content);
    default:
      return state;
  }
}
