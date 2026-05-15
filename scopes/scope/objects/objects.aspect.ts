import { Aspect } from '../../harmony/harmony/aspect';

export const ObjectsAspect = Aspect.create({
  id: 'teambit.scope/objects',
  runtimes: { main: () => import('./objects.main.runtime') },
});
