import { Aspect } from '../../harmony/harmony/aspect';

export const InstallAspect = Aspect.create({
  id: 'teambit.workspace/install',
  runtimes: { main: () => import('./install.main.runtime') },
});
