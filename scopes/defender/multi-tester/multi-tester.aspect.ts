import { Aspect } from '@teambit/core';

export const MultiTesterAspect = Aspect.create({
  id: 'teambit.defender/multi-tester',
  runtimes: { main: () => import('./multi-tester.main.runtime') },
});
