import { Workspace } from '@teambit/workspace';
import { ScopeExtension } from '@teambit/scope';
import ComponentResolver from './component-resolver';

export type ComponentResolverDeps = [Workspace, ScopeExtension];

export default async function provideComponentResolver([workspace, scope]: ComponentResolverDeps) {
  const componentResolver = new ComponentResolver(scope, workspace);
  return componentResolver;
}
