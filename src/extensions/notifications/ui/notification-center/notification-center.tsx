import React from 'react';

import { Notification } from '../notification';
import { Message } from '../notification-context';

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
