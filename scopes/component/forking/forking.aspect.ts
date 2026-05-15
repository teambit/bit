import { Aspect } from '@teambit/core';

export const ForkingAspect = Aspect.create({
  id: 'teambit.component/forking',
  runtimes: { main: () => import('./forking.main.runtime') },
  commands: () => import('./forking.commands').then((m) => [m.forkCommand]),
});
