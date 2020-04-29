import { ExtensionManifest } from '@teambit/harmony';
import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { ScopeExt } from '@bit/bit.core.scope';

export const ComponentResolverExt: ExtensionManifest = {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExt],
  provider: componentResolverProvider
};
