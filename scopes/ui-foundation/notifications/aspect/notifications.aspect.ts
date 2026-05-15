import { Aspect } from '@teambit/core';

export const NotificationsAspect = Aspect.create({
  id: 'teambit.ui-foundation/notifications',
  runtimes: { ui: () => import('./notification.ui.runtime') },
});

export default NotificationsAspect;
