import { Aspect } from '@teambit/core';

export const AspectLoaderAspect = Aspect.create({
  id: 'teambit.harmony/aspect-loader',
  runtimes: { main: () => import('./aspect-loader.main.runtime') },
});

export default AspectLoaderAspect;
