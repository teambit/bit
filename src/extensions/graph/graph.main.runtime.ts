import { ExtensionManifest } from '@teambit/harmony';
import { GraphAspect } from './graph.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { provide } from './graph.provider';
import { WorkspaceAspect } from '../workspace';
import { ScopeAspect } from '../scope';
import { ComponentAspect } from '../component';

export const GraphMain = {
  name: 'graph',
  runtime: MainRuntime,
  dependencies: [WorkspaceAspect, ScopeAspect, ComponentAspect],
  provider: provide,
};

GraphAspect.addRuntime(GraphMain);
