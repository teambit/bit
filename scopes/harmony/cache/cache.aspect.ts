import { Aspect } from '@teambit/core';

export const CacheAspect = Aspect.create({
  id: 'teambit.harmony/cache',
  runtimes: { main: () => import('./cache.main.runtime') },
});
