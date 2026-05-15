import { Aspect } from '@teambit/core';

export const StashAspect = Aspect.create({
  id: 'teambit.component/stash',
  runtimes: { main: () => import('./stash.main.runtime') },
});
