import { Card } from '@teambit/base-ui.surfaces.card';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { TimeAgo } from '@teambit/staged-components.workspace-components.time-ago';
import { XButton } from '@teambit/evangelist.elements.x-button';
import classNames from 'classnames';
import React, { useCallback, useContext, useState } from 'react';

import { NotificationContext } from '@teambit/notifications.notification-context';
import { Message } from '@teambit/notifications.api';
import styles from './notification.module.scss';
import { LevelIcon } from './level-icon';

const DISMISS_TIME = +styles.dismissTime;

export function Notification({ entry }: { entry: Message }) {
  const [isDismissing, setDismissing] = useState(false);
  const notificationApi = useContext(NotificationContext);
  const { level, time, message, id } = entry;

  const handleDismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      notificationApi.dismiss(id);
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
