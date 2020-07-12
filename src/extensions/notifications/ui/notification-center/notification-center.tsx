import React, { useContext, useCallback } from 'react';
import { Card } from '@bit/bit.base-ui.surfaces.card';
import { Separator } from '@bit/bit.test-scope.ui.separator';

import { Message, NotificationContext } from '..';
import styles from './notification-center.module.scss';

export function NotificationCenter({ notifications }: { notifications: Message[] }) {
  return (
    <div className={styles.notificationCenter}>
      {notifications.map(x => (
        <Notification key={x.time} entry={x} />
      ))}
    </div>
  );
}

function Notification({ entry }: { entry: Message }) {
  const notificationApi = useContext(NotificationContext);

  const handleDismiss = useCallback(() => {
    notificationApi.dismiss(entry.id);
  }, []);

  return (
    <Card className={styles.notification}>
      <button onClick={handleDismiss}>x</button>
      <div>{entry.level}</div>
      <Separator />
      {entry.message}
    </Card>
  );
}
