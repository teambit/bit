import { Workspace } from '../workspace';
import { Scope } from '../scope';
import ComponentResolver from './component-resolver';

export type ComponentResolverDeps = [Workspace, Scope];

export default async function provideComponentResolver([workspace, scope]: ComponentResolverDeps) {
  const componentResolver = new ComponentResolver(scope, workspace);
  return componentResolver;
}
