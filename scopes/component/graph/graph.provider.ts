import { GraphqlMain } from '@teambit/graphql';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { ComponentMain } from '@teambit/component';

import { GraphBuilder } from './graph-builder';
import { graphSchema } from './graph.graphql';

export type GraphDeps = [GraphqlMain, ComponentMain, Workspace, ScopeMain];

export async function provide([graphql, componentMain, workspace, scope]: GraphDeps) {
  const graphBuilder = new GraphBuilder(workspace, scope);
  const host = componentMain.getHost();
  graphql.register(graphSchema(graphBuilder, host));
  return graphBuilder;
}
