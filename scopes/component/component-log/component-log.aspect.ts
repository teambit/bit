import { Aspect } from '../../harmony/harmony/aspect';

export const ComponentLogAspect = Aspect.create({
  id: 'teambit.component/component-log',
  runtimes: { main: () => import('./component-log.main.runtime') },
  commands: () => import('./component-log.commands').then((m) => [m.logCommand, m.logFileCommand, m.blameCommand]),
});
