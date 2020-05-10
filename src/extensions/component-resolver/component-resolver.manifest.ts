import { ExtensionManifest } from '@teambit/harmony';
import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '../../extensions/workspace';
import { ScopeExt } from '../scope';

export const ComponentResolverExt: ExtensionManifest = {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExt],
  provider: componentResolverProvider
};
