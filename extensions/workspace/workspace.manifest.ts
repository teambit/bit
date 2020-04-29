import { ExtensionManifest } from '@teambit/harmony';
import workspaceProvider from './workspace.provider';
import { ScopeExt } from '@bit/bit.core.scope';
import { ComponentFactoryExt } from '@bit/bit.core.component';
import { IsolatorExt } from '@bit/bit.core.isolator';
import { WorkspaceConfigExt } from '@bit/bit.core.workspace-config';
import { LoggerExt } from '@bit/bit.core.logger';
import { DependencyResolverExt } from '@bit/bit.core.dependency-resolver';

export default {
  name: 'workspace',
  dependencies: [WorkspaceConfigExt, ScopeExt, ComponentFactoryExt, IsolatorExt, DependencyResolverExt, LoggerExt],
  provider: workspaceProvider
} as ExtensionManifest;
