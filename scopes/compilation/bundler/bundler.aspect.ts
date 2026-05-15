import { Aspect } from '@teambit/core';

export const BundlerAspect = Aspect.create({
  id: 'teambit.compilation/bundler',
  runtimes: { main: () => import('./bundler.main.runtime') },
});
