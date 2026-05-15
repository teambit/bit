import { Aspect } from '@teambit/core';

export const ConfigMergerAspect = Aspect.create({
  id: 'teambit.workspace/config-merger',
  runtimes: { main: () => import('./config-merger.main.runtime') },
});
