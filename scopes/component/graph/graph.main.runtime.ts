import { MainRuntime } from '@teambit/cli';
import GraphqlAspect from '@teambit/graphql';
import { ScopeAspect } from '@teambit/scope';
import { ComponentAspect } from '@teambit/component';
import { WorkspaceAspect } from '@teambit/workspace';

import { GraphAspect } from './graph.aspect';
import { provide } from './graph.provider';

export const GraphMain = {
  name: 'graph',
  runtime: MainRuntime,
  dependencies: [GraphqlAspect, ComponentAspect, WorkspaceAspect, ScopeAspect],
  provider: provide,
};

GraphAspect.addRuntime(GraphMain);
