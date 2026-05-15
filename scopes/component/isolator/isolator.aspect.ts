import { Aspect } from '@teambit/core';

export const IsolatorAspect = Aspect.create({
  id: 'teambit.component/isolator',
  runtimes: { main: () => import('./isolator.main.runtime') },
});
