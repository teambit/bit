import { Workspace } from '../workspace';
import { ScopeExtension } from '../scope';
import ComponentResolver from './component-resolver';

export type ComponentResolverDeps = [Workspace, ScopeExtension];

export default async function provideComponentResolver([workspace, scope]: ComponentResolverDeps) {
  const componentResolver = new ComponentResolver(scope, workspace);
  return componentResolver;
}
