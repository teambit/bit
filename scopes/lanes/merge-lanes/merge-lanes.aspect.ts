import { Aspect } from '@teambit/core';

export const MergeLanesAspect = Aspect.create({
  id: 'teambit.lanes/merge-lanes',
  runtimes: { main: () => import('./merge-lanes.main.runtime') },
});
