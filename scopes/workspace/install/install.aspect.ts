import { Aspect } from '@teambit/core';

export const InstallAspect = Aspect.create({
  id: 'teambit.workspace/install',
  runtimes: { main: () => import('./install.main.runtime') },
});
