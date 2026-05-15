import { Aspect } from '../harmony/aspect';

export const ApplicationAspect = Aspect.create({
  id: 'teambit.harmony/application',
  runtimes: { main: () => import('./application.main.runtime') },
  commands: () => import('./application.commands').then((m) => [m.runCommand]),
});
