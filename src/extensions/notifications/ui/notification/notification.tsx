import React, { useContext, useCallback, useState } from 'react';
import classNames from 'classnames';
import { Card } from '@bit/bit.base-ui.surfaces.card';
import { mutedText } from '@bit/bit.base-ui.text.muted-text';
import { Separator } from '@bit/bit.base-ui.elements.separator';
import { NotificationContext, Message } from '../notification-context';
import styles from './notification.module.scss';
import { TimeAgo } from '../../../stage-components/workspace-components/time-ago';

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
    <Card className={classNames(styles.notification, isDismissing && styles.dismissing)}>
      <button onClick={isDismissing ? undefined : handleDismiss}>x</button>
      <div>{level}</div>
      <Separator className={styles.separator} />

      {message}

      {time && (
        <div className={classNames(styles.timestamp, mutedText)}>
          <TimeAgo date={time} />
        </div>
      )}
    </Card>
  );
}
