import { Aspect } from '@teambit/core';

export const ModuleFederationAspect = Aspect.create({
  id: 'teambit.webpack/module-federation',
  runtimes: { main: () => import('./module-federation.main.runtime') },
});
