import { Aspect } from '@teambit/core';

export const ScopeAspect = Aspect.create({
  id: 'teambit.scope/scope',
  runtimes: { main: () => import('./scope.main.runtime') },
});

export default ScopeAspect;
