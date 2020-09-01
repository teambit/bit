import React from 'react';

import { Message } from '@teambit/organism.notifications.api';
import { Notification } from '@teambit/organism.notifications.notification';
import styles from './notification-center.module.scss';

export type NotificationCenterProps = {
  notifications?: Message[];
} & React.HTMLAttributes<HTMLDivElement>;

export function NotificationCenter({ notifications, ...rest }: NotificationCenterProps) {
  return (
    <div {...rest} className={styles.notificationCenter}>
      {notifications?.map((x) => (
        <Notification key={x.id} entry={x} />
      ))}
    </div>
  );
}
