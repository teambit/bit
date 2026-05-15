import { Aspect } from '@teambit/core';

/**
 * Main bit aspect
 */
export const BitAspect = Aspect.create({
  id: 'teambit.harmony/bit',
  runtimes: { main: () => import('./bit.main.runtime') },
});
