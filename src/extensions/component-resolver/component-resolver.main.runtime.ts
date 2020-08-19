import { ComponentResolverAspect } from './component-resolver.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { ExtensionManifest } from '@teambit/harmony';
import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '../workspace';
import { ScopeExtension } from '../scope';

export const ComponentResolverExt: ExtensionManifest = {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExtension],
  provider: componentResolverProvider,
};

ComponentResolverAspect.addRuntime(ComponentResolverMain);
