import { GraphqlMain } from '@teambit/graphql';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';

import { GraphBuilder } from './graph-builder';
import { graphSchema } from './graph.graphql';

export type GraphDeps = [GraphqlMain, Workspace, ScopeMain];

export async function provide([graphql, workspace, scope]: GraphDeps) {
  const graphBuilder = new GraphBuilder(workspace, scope);
  graphql.register(graphSchema(graphBuilder));
  return graphBuilder;
}
