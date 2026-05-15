import { Aspect } from '@teambit/core';

export const TrackerAspect = Aspect.create({
  id: 'teambit.component/tracker',
  runtimes: { main: () => import('./tracker.main.runtime') },
  commands: () => import('./tracker.commands').then((m) => [m.addCommand]),
});
