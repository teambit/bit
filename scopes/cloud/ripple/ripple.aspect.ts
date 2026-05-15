import { Aspect } from '@teambit/core';

export const RippleAspect = Aspect.create({
  id: 'teambit.cloud/ripple',
  runtimes: { main: () => import('./ripple.main.runtime') },
});

export default RippleAspect;
