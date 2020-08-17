import { ExtensionManifest } from '@teambit/harmony';
import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '@teambit/workspace';
import { ScopeExtension } from '@teambit/scope';

export const ComponentResolverExt: ExtensionManifest = {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExtension],
  provider: componentResolverProvider,
};
