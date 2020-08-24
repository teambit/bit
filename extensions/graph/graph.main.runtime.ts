import { MainRuntime } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { ScopeAspect } from '@teambit/scope';
import { WorkspaceAspect } from '@teambit/workspace';

import { GraphAspect } from './graph.aspect';
import { provide } from './graph.provider';

export const GraphMain = {
  name: 'graph',
  runtime: MainRuntime,
  dependencies: [WorkspaceAspect, ScopeAspect, ComponentAspect],
  provider: provide,
};

GraphAspect.addRuntime(GraphMain);
