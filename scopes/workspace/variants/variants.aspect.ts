import { Aspect } from '@teambit/core';

export const VariantsAspect = Aspect.create({
  id: 'teambit.workspace/variants',
  runtimes: { main: () => import('./variants.main.runtime') },
});
