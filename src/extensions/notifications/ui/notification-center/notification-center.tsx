import React from 'react';

import { Notification } from './notification';
import { Message } from '../notification-context';

import styles from './notification-center.module.scss';

export function NotificationCenter({ notifications }: { notifications: Message[] }) {
  return (
    <div className={styles.notificationCenter}>
      {notifications.map(x => (
        <Notification key={x.id} entry={x} />
      ))}
    </div>
  );
}
