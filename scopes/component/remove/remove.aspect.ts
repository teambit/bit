import { Aspect } from '../../harmony/harmony/aspect';

export const RemoveAspect = Aspect.create({
  id: 'teambit.component/remove',
  runtimes: { main: () => import('./remove.main.runtime') },
  commands: () => import('./remove.commands').then((m) => [m.removeCommand, m.deleteCommand, m.recoverCommand]),
});
