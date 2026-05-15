import { Aspect } from '@teambit/core';

export const BabelAspect = Aspect.create({
  id: 'teambit.compilation/babel',
  runtimes: { main: () => import('./babel.main.runtime') },
});
