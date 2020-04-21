import { Workspace } from '@bit/bit.core.workspace';
import { Scope } from '@bit/bit.core.scope';
import ComponentResolver from './component-resolver';

export type ComponentResolverDeps = [Workspace, Scope];

export type ComponentResolverConfig = {};

export default async function provideComponentResolver(
  config: ComponentResolverConfig,
  [workspace, scope]: ComponentResolverDeps
) {
  const componentResolver = new ComponentResolver(scope, workspace);
  return componentResolver;
}
