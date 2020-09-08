import React, { useState, useContext, useCallback } from 'react';
import classnames from 'classnames';

import { Message } from '@teambit/notifications.api';
import { Notification } from '@teambit/notifications.notification';
import { NotificationContext } from '@teambit/notifications.notification-context';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';

import styles from './notification-center.module.scss';
import { DismissButton } from './dismiss-button';

export type NotificationCenterProps = {
  notifications?: Message[];
} & React.HTMLAttributes<HTMLDivElement>;

export function NotificationCenter({ notifications, ...rest }: NotificationCenterProps) {
  const [isDismissing, setDismissing] = useState(false);
  const notificationApi = useContext(NotificationContext);

  const handleDismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      notificationApi.clear();
      setDismissing(false);
    }, +styles.animationTime);
  }, []);

  const showDismiss = !isDismissing && !!notifications && notifications.length > 1;

  return (
    <div {...rest} className={classnames(styles.notificationCenter, isDismissing && styles.dismissing, darkMode)}>
      <div className={styles.notificationsContainer}>
        {notifications?.reverse().map((x) => (
          <Notification key={x.id} entry={x} />
        ))}
      </div>
      <div className={styles.actions}>
        <DismissButton
          visible={showDismiss}
          importance="normal"
          className={styles.dismissAll}
          onClick={handleDismiss}
        />
      </div>
    </div>
  );
}
