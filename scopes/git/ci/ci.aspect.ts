import { Aspect } from '@teambit/core';

export const CiAspect = Aspect.create({
  id: 'teambit.git/ci',
  runtimes: { main: () => import('./ci.main.runtime') },
});

export default CiAspect;
