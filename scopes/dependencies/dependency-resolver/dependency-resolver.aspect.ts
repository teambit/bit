import { Aspect } from '@teambit/core';

export const DependencyResolverAspect = Aspect.create({
  id: 'teambit.dependencies/dependency-resolver',
  runtimes: { main: () => import('./dependency-resolver.main.runtime') },
});
