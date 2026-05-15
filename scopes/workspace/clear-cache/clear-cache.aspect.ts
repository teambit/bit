import { Aspect } from '@teambit/core';

export const ClearCacheAspect = Aspect.create({
  id: 'teambit.bit/clear-cache',
  runtimes: { main: () => import('./clear-cache.main.runtime') },
  commands: () => import('./clear-cache.commands').then((m) => [m.clearCacheCommand]),
});
