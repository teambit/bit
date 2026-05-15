import { Aspect } from '../../harmony/harmony/aspect';

export const DependenciesAspect = Aspect.create({
  id: 'teambit.dependencies/dependencies',
  runtimes: { main: () => import('./dependencies.main.runtime') },
  commands: () => import('./dependencies.commands').then((m) => [m.whyCommand, m.setPeerCommand, m.unsetPeerCommand, m.dependentsCommand]),
});
