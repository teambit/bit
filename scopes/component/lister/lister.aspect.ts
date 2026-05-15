import { Aspect } from '../../harmony/harmony/aspect';

export const ListerAspect = Aspect.create({
  id: 'teambit.component/lister',
  runtimes: { main: () => import('./lister.main.runtime') },
  commands: () => import('./lister.commands').then((m) => [m.listCommand, m.searchCommand]),
});
