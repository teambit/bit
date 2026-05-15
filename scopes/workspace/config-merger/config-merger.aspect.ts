import { Aspect } from '../../harmony/harmony/aspect';

export const ConfigMergerAspect = Aspect.create({
  id: 'teambit.workspace/config-merger',
  runtimes: { main: () => import('./config-merger.main.runtime') },
});
