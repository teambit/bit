import { DependencyResolver } from './dependency-resolver';

export async function provideDependencyResolver() {
  const dependencyResolver = new DependencyResolver();
  return dependencyResolver;
}
