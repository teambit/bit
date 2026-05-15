import { Aspect } from '@teambit/core';

export const SassAspect = Aspect.create({
  id: 'teambit.ui-foundation/sass',
  runtimes: { main: () => import('./sass.main.runtime') },
});
