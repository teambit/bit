import { ExtensionManifest } from '@teambit/harmony';
import workspaceProvider from './workspace.provider';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';
import { IsolatorExt } from '../isolator';
import { WorkspaceConfigExt } from '../workspace-config';
import { LoggerExt } from '../logger';
import { DependencyResolverExt } from '../dependency-resolver';

export default {
  name: 'workspace',
  dependencies: [WorkspaceConfigExt, ScopeExt, ComponentFactoryExt, IsolatorExt, DependencyResolverExt, LoggerExt],
  provider: workspaceProvider
} as ExtensionManifest;
