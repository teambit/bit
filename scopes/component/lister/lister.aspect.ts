import { Aspect } from '@teambit/core';

export const ListerAspect = Aspect.create({
  id: 'teambit.component/lister',
  runtimes: { main: () => import('./lister.main.runtime') },
  commands: () => import('./lister.commands').then((m) => [m.listCommand, m.searchCommand]),
});
