import { Aspect } from '@teambit/core';

export const MergingAspect = Aspect.create({
  id: 'teambit.component/merging',
  runtimes: { main: () => import('./merging.main.runtime') },
  commands: () => import('./merging.commands').then((m) => [m.mergeCommand]),
});
