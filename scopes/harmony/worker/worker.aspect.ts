import { Aspect } from '../harmony/aspect';

export const WorkerAspect = Aspect.create({
  id: 'teambit.harmony/worker',
  runtimes: { main: () => import('./worker.main.runtime') },
});
