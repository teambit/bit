import { Aspect } from '../../harmony/harmony/aspect';

export const DependencyResolverAspect = Aspect.create({
  id: 'teambit.dependencies/dependency-resolver',
  runtimes: { main: () => import('./dependency-resolver.main.runtime') },
});
