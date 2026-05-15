import { Aspect } from '@teambit/core';

export const PrettierAspect = Aspect.create({
  id: 'teambit.defender/prettier',
  runtimes: { main: () => import('./prettier.main.runtime') },
});
