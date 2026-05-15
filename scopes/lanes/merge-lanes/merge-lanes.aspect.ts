import { Aspect } from '../../harmony/harmony/aspect';

export const MergeLanesAspect = Aspect.create({
  id: 'teambit.lanes/merge-lanes',
  runtimes: { main: () => import('./merge-lanes.main.runtime') },
});
