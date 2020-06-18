import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './graph.provider';
import { WorkspaceExt } from '../workspace';
import { ScopeExtension } from '../scope';
import { ComponentFactoryExt } from '../component';

export default {
  name: 'graph',
  dependencies: [WorkspaceExt, ScopeExtension, ComponentFactoryExt],
  provider: provide
} as ExtensionManifest;
