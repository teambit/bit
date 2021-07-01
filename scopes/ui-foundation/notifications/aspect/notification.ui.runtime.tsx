import { UIAspect, UIRuntime, UiUI } from '@teambit/ui';
import React, { ReactNode, useReducer } from 'react';
import { v1 } from 'uuid';

import { NotificationContext } from '@teambit/ui-foundation.ui.notifications.notification-context';
import {
  NotificationCenter,
  NotificationCenterProps,
} from '@teambit/ui-foundation.ui.notifications.notification-center';
import { MessageLevel, NotificationsStore } from '@teambit/ui-foundation.ui.notifications.store';
import { NotificationAction, notificationReducer } from './notification-reducer';
import { NotificationsAspect } from './notifications.aspect';

/**
 * extension
 */
export default class NotificationUI implements NotificationsStore {
  static dependencies = [UIAspect];

  static runtime = UIRuntime;

  static async provider([uiRuntimeExtension]: [UiUI]) {
    return new NotificationUI(uiRuntimeExtension);
  }

  constructor(uiRuntimeExtension: UiUI) {
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

  /** removes all notifications */
  clear = () => {
    this.dispatch?.({
      type: 'clear',
    });
  };

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

NotificationsAspect.addRuntime(NotificationUI);
