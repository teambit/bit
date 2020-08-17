import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './graph.provider';
import { WorkspaceExt } from '@teambit/workspace';
import { ScopeExtension } from '@teambit/scope';
import { ComponentFactoryExt } from '@teambit/component';

export default {
  name: 'graph',
  dependencies: [WorkspaceExt, ScopeExtension, ComponentFactoryExt],
  provider: provide,
} as ExtensionManifest;
