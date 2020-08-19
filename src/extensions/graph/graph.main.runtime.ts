import { ExtensionManifest } from '@teambit/harmony';
import { GraphAspect } from './graph.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { provide } from './graph.provider';
import { WorkspaceAspect } from '../workspace';
import { ScopeExtension } from '../scope';
import { ComponentFactoryExt } from '../component';

export default {
  name: 'graph',
  runtime: MainRuntime,
  dependencies: [WorkspaceAspect, ScopeExtension, ComponentFactoryExt],
  provider: provide,
} as ExtensionManifest;

GraphAspect.addRuntime(GraphMain);
