import { Aspect } from '@teambit/core';

export const ObjectsAspect = Aspect.create({
  id: 'teambit.scope/objects',
  runtimes: { main: () => import('./objects.main.runtime') },
});
