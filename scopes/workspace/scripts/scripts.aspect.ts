import { Aspect } from '@teambit/core';

export const ScriptsAspect = Aspect.create({
  id: 'teambit.workspace/scripts',
  runtimes: { main: () => import('./scripts.main.runtime') },
});
