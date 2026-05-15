import { Aspect } from '@teambit/core';

export const StatusAspect = Aspect.create({
  id: 'teambit.component/status',
  runtimes: { main: () => import('./status.main.runtime') },
});
