import { Aspect } from '@teambit/core';

export const MochaAspect = Aspect.create({
  id: 'teambit.defender/mocha',
  runtimes: { main: () => import('./mocha.main.runtime') },
});
