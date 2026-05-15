import { Aspect } from '@teambit/core';

export const JestAspect = Aspect.create({
  id: 'teambit.defender/jest',
  runtimes: { main: () => import('./jest.main.runtime') },
});
