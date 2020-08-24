import { Separator } from '@teambit/base-ui-temp.elements.separator';
import { Card } from '@teambit/base-ui-temp.surfaces.card';
import { mutedText } from '@teambit/base-ui-temp.text.muted-text';
import { TimeAgo } from '@teambit/staged-components.workspace-components.time-ago';
import classNames from 'classnames';
import React, { useCallback, useContext, useState } from 'react';

import { Message, NotificationContext } from '../notification-context';
import styles from './notification.module.scss';

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
