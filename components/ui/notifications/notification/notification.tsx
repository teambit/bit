import { Card } from '@teambit/base-ui.surfaces.card';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { XButton } from '@teambit/evangelist.elements.x-button';
import classNames from 'classnames';
import React, { useCallback, useContext, useState } from 'react';
import { LevelIcon } from '@teambit/design.ui.elements.level-icon';
import { NotificationContext } from '@teambit/ui-foundation.ui.notifications.notification-context';
import { Message } from '@teambit/ui-foundation.ui.notifications.store';
import styles from './notification.module.scss';

const DISMISS_TIME = +styles.dismissTime;

export function Notification({ entry }: { entry: Message }) {
  const [isDismissing, setDismissing] = useState(false);
  const notificationsStore = useContext(NotificationContext);
  const { level, time, message, id } = entry;

  const handleDismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      notificationsStore.dismiss(id);
    }, DISMISS_TIME);
  }, [id]);

  return (
    <Card className={classNames(styles.notification, isDismissing && styles.dismissing)} elevation="none">
      <LevelIcon level={level} className={styles.icon} />

      <div className={styles.main}>
        <div className={styles.type}>{level.toString()}</div>

        <div className={styles.message}>{message}</div>

        {time && (
          <div className={classNames(styles.timestamp, mutedText)}>
            <TimeAgo date={time} />
          </div>
        )}
      </div>
      <XButton onClick={isDismissing ? undefined : handleDismiss}></XButton>
    </Card>
  );
}
