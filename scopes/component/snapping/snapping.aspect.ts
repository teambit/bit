import { Aspect } from '../../harmony/harmony/aspect';

export const SnappingAspect = Aspect.create({
  id: 'teambit.component/snapping',
  runtimes: { main: () => import('./snapping.main.runtime') },
});
