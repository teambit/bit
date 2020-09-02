import React, { useState, useContext, useCallback } from 'react';
import classnames from 'classnames';

import { Message } from '@teambit/organism.notifications.api';
import { Notification } from '@teambit/organism.notifications.notification';
import { NotificationContext } from '@teambit/organism.notifications.notification-context';

import styles from './notification-center.module.scss';
import { darkMode } from './dark-art';
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
      {notifications?.map((x) => (
        <Notification key={x.id} entry={x} />
      ))}
      <DismissButton visible={showDismiss} onClick={handleDismiss} />
    </div>
  );
}
