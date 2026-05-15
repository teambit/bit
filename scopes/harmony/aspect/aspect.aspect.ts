import { Aspect } from '@teambit/core';

export const AspectAspect = Aspect.create({
  id: 'teambit.harmony/aspect',
  runtimes: { main: () => import('./aspect.main.runtime') },
});

export default AspectAspect;
