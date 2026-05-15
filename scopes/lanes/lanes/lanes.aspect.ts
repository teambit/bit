import { Aspect } from '../../harmony/harmony/aspect';

export const LanesAspect = Aspect.create({
  id: 'teambit.lanes/lanes',
  runtimes: { main: () => import('./lanes.main.runtime') },
  commands: () => import('./lanes.commands').then((m) => [m.catLaneHistoryCommand]),
});

export default LanesAspect;
