import { ComponentContext } from '@teambit/component';
import { ComponentPreview } from '@teambit/ui.component-preview';
import React, { useContext, useEffect } from 'react';
import { NotificationContext } from '@teambit/ui.notifications.notification-context';

export function Overview() {
  const component = useContext(ComponentContext);

  // add notification for empty state
  const notifications = useContext(NotificationContext);

  useEffect(() => {
    const message = notifications.log("you've got no docs! let Debbie show you how it's done");
    const timeoutId = setTimeout(() => notifications.dismiss(message), 10 * 1000);

    return () => {
      clearTimeout(timeoutId);
      notifications.dismiss(message);
    };
  }, []);
  return <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
}
