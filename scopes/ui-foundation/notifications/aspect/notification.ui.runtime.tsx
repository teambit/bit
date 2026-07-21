import type { UiUI } from '@teambit/ui';
import { UIAspect, UIRuntime } from '@teambit/ui';
import type { ReactNode } from 'react';
import React, { useEffect, useReducer } from 'react';
import { v1 } from 'uuid';

import { NotificationContext } from '@teambit/ui-foundation.ui.notifications.notification-context';
import type { NotificationCenterProps } from '@teambit/ui-foundation.ui.notifications.notification-center';
import { NotificationCenter } from '@teambit/ui-foundation.ui.notifications.notification-center';
import { useSearchParams } from 'react-router-dom';
import type { NotificationsStore } from '@teambit/ui-foundation.ui.notifications.store';
import { MessageLevel } from '@teambit/ui-foundation.ui.notifications.store';
import type { NotificationAction } from './notification-reducer';
import { notificationReducer } from './notification-reducer';
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
    uiRuntimeExtension.registerRenderHooks({ reactContext: this.renderContext });
  }

  private dispatch?: React.Dispatch<NotificationAction>;

  /**
   * when the workspace ui runs in minimal mode, no notification should reach the screen,
   * no matter which aspect (or external hook, e.g. `useDataQuery`) produced it.
   */
  private isMinimal = false;

  /** adds a full message to the log */
  add = (message: string, level: MessageLevel) => {
    if (this.isMinimal) return '';

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
    const [searchParams] = useSearchParams();
    const isMinimal = searchParams.get('minimal-mode') === 'true';
    this.dispatch = dispatch;
    this.isMinimal = isMinimal;

    // drop any queued messages when entering minimal mode, so toggling minimal
    // mode back off later doesn't resurrect stale notifications.
    useEffect(() => {
      if (isMinimal) dispatch({ type: 'clear' });
    }, [isMinimal]);

    if (isMinimal) return null;

    return <NotificationCenter {...props} notifications={messages} />;
  };

  private renderContext = ({ children }: { children: ReactNode }) => {
    return <NotificationContext.Provider value={this}>{children}</NotificationContext.Provider>;
  };
}

NotificationsAspect.addRuntime(NotificationUI);
