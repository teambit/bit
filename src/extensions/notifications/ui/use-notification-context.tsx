import { useCallback, useMemo, useReducer } from 'react';
import { v1 } from 'uuid';

import { NotificationApi, Message, MessageLevel } from './notification-context';

export function useNotifications(): [NotificationApi, Message[]] {
  const [messages, dispatch] = useReducer(notificationReducer, []);

  const add = useCallback((message: string, level: MessageLevel) => {
    const id = v1();

    dispatch({
      type: 'add',
      content: {
        id,
        message,
        level: level,
        time: new Date().toISOString()
      }
    });

    return id;
  }, []);

  const api = useMemo<NotificationApi>(
    () => ({
      add,
      log: (message: string) => add(message, MessageLevel.info),
      warn: (message: string) => add(message, MessageLevel.warning),
      error: (message: string) => add(message, MessageLevel.error),
      success: (message: string) => add(message, MessageLevel.success),

      dismiss(id: string) {
        dispatch({
          type: 'dismiss',
          id
        });
      }
    }),
    []
  );

  return [api, messages];
}

type NotificationAction = {
  type: 'add' | 'dismiss';
  content?: Message;
  id?: string;
};

function notificationReducer(state: Message[], action: NotificationAction) {
  switch (action.type) {
    case 'dismiss':
      return state.filter(x => x.id !== action.id);
    case 'add':
      if (!action.content) {
        return state;
      }
      return state.concat(action.content);
    default:
      return state;
  }
}
