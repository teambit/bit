import { GraphAspect } from './graph.aspect';
import { MainRuntime } from '@teambit/cli';
import { provide } from './graph.provider';
import { WorkspaceAspect } from '@teambit/workspace';
import { ScopeAspect } from '@teambit/scope';
import { ComponentAspect } from '@teambit/component';

export const GraphMain = {
  name: 'graph',
  runtime: MainRuntime,
  dependencies: [WorkspaceAspect, ScopeAspect, ComponentAspect],
  provider: provide,
};

GraphAspect.addRuntime(GraphMain);
