import { Aspect } from '@teambit/core';

export const WorkerAspect = Aspect.create({
  id: 'teambit.harmony/worker',
  runtimes: { main: () => import('./worker.main.runtime') },
});
