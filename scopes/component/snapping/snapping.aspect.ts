import { Aspect } from '@teambit/core';

export const SnappingAspect = Aspect.create({
  id: 'teambit.component/snapping',
  runtimes: { main: () => import('./snapping.main.runtime') },
});
