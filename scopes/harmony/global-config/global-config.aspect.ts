import { Aspect } from '../harmony/aspect';

export const GlobalConfigAspect = Aspect.create({
  id: 'teambit.harmony/global-config',
  runtimes: { main: () => import('./global-config.main.runtime') },
  commands: () => import('./global-config.commands').then((m) => [m.globalsCommand, m.remoteCommand]),
});

export default GlobalConfigAspect;
