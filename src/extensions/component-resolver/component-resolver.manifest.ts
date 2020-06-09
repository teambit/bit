import { ExtensionManifest } from '@teambit/harmony';
import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '../../extensions/workspace';
import { ScopeExtension } from '../scope';

export const ComponentResolverExt: ExtensionManifest = {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExtension],
  provider: componentResolverProvider
};
