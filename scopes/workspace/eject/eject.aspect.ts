import { Aspect } from '../../harmony/harmony/aspect';

export const EjectAspect = Aspect.create({
  id: 'teambit.workspace/eject',
  runtimes: { main: () => import('./eject.main.runtime') },
  commands: () => import('./eject.commands').then((m) => [m.ejectCommand]),
});
