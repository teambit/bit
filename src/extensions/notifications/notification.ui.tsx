import React, { ReactNode, useReducer } from 'react';
import { v1 } from 'uuid';

import { NotificationApi, MessageLevel } from './notification-api';
import { NotificationCenter, NotificationCenterProps } from './ui/notification-center';
import { NotificationContext } from './ui/notification-context';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { NotificationAction, notificationReducer } from './notification-reducer';

/**
 * extension
 */
export default class NotificationUI implements NotificationApi {
  static id = '@teambit/notification';
  static dependencies = [UIRuntimeExtension];
  static async provider([uiRuntimeExtension]: [UIRuntimeExtension]) {
    return new NotificationUI(uiRuntimeExtension);
  }

  constructor(uiRuntimeExtension: UIRuntimeExtension) {
    uiRuntimeExtension.registerHudItem(<this.render key="NotificationUI" />);
    uiRuntimeExtension.registerContext(this.renderContext);
  }

  private dispatch?: React.Dispatch<NotificationAction>;

  /** adds a full message to the log */
  add = (message: string, level: MessageLevel) => {
    const id = v1();

    this.dispatch?.({
      type: 'add',
      content: {
        id,
        message,
        level,
        time: new Date().toISOString(),
      },
    });

    return id;
  };

  /** removes/archives a message from the log */
  dismiss(id: string) {
    this.dispatch?.({
      type: 'dismiss',
      id,
    });
  }

  /** adds a message with level "info" to the log */
  log = (message: string) => this.add(message, MessageLevel.info);
  /** adds a message with level "warning" to the log */
  warn = (message: string) => this.add(message, MessageLevel.warning);
  /** adds a message with level "error" to the log */
  error = (message: string) => this.add(message, MessageLevel.error);
  /** adds a message with level "success" to the log */
  success = (message: string) => this.add(message, MessageLevel.success);

  private render = (props: Omit<NotificationCenterProps, 'notifications'>) => {
    // this code assumes a single place of render per instance of NotificationUI
    const [messages, dispatch] = useReducer(notificationReducer, []);
    this.dispatch = dispatch;

    return <NotificationCenter {...props} notifications={messages} />;
  };

  private renderContext = ({ children }: { children: ReactNode }) => {
    return <NotificationContext.Provider value={this}>{children}</NotificationContext.Provider>;
  };
}
