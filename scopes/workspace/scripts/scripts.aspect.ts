import { Aspect } from '../../harmony/harmony/aspect';

export const ScriptsAspect = Aspect.create({
  id: 'teambit.workspace/scripts',
  runtimes: { main: () => import('./scripts.main.runtime') },
});
