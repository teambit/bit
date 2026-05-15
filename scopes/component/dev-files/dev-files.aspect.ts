import { Aspect } from '@teambit/core';

export const DevFilesAspect = Aspect.create({
  id: 'teambit.component/dev-files',
  runtimes: { main: () => import('./dev-files.main.runtime') },
});
