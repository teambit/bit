import { Aspect } from '../../harmony/harmony/aspect';

export const StatusAspect = Aspect.create({
  id: 'teambit.component/status',
  runtimes: { main: () => import('./status.main.runtime') },
  commands: () => import('./status.commands').then((m) => [m.statusCommand, m.miniStatusCommand]),
});
