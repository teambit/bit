import { Aspect } from '../../harmony/harmony/aspect';

export const RenamingAspect = Aspect.create({
  id: 'teambit.component/renaming',
  runtimes: { main: () => import('./renaming.main.runtime') },
  commands: () => import('./renaming.commands').then((m) => [m.renameCommand]),
});
