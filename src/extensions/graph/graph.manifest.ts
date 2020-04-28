import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './graph.provider';
import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';

export default {
  name: 'graph',
  dependencies: [WorkspaceExt, ScopeExt, ComponentFactoryExt],
  provider: provide
} as ExtensionManifest;
