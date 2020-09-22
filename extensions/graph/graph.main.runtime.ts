import { MainRuntime } from '@teambit/cli';
import { ScopeAspect } from '@teambit/scope';
import { WorkspaceAspect } from '@teambit/workspace';

import { GraphAspect } from './graph.aspect';
import { provide } from './graph.provider';

export const GraphMain = {
  name: 'graph',
  runtime: MainRuntime,
  dependencies: [WorkspaceAspect, ScopeAspect],
  provider: provide,
};

GraphAspect.addRuntime(GraphMain);
