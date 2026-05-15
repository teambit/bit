import { Aspect } from '../../harmony/harmony/aspect';

export const MoverAspect = Aspect.create({
  id: 'teambit.component/mover',
  runtimes: { main: () => import('./mover.main.runtime') },
  commands: () => import('./mover.commands').then((m) => [m.moveCommand]),
});
