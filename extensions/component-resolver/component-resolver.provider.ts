import { Workspace } from '@bit/bit.core.workspace';
import { Scope } from '@bit/bit.core.scope';
import ComponentResolver from './component-resolver';

export type ComponentResolverDeps = [Workspace, Scope];

export default async function provideComponentResolver([workspace, scope]: ComponentResolverDeps) {
  const componentResolver = new ComponentResolver(scope, workspace);
  return componentResolver;
}
