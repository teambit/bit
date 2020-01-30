import { Workspace } from '../workspace';
import { Scope } from '../../scope/scope.api';
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
