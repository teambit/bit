import { Aspect } from '@teambit/core';

export const PkgAspect = Aspect.create({
  id: 'teambit.pkg/pkg',
  runtimes: { main: () => import('./pkg.main.runtime') },
});

export default PkgAspect;
