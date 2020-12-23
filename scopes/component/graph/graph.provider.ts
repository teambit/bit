import { GraphqlMain } from '@teambit/graphql';
import { ComponentMain } from '@teambit/component';

import { GraphBuilder } from './graph-builder';
import { graphSchema } from './graph.graphql';

export type GraphDeps = [GraphqlMain, ComponentMain];

export async function provide([graphql, componentMain]: GraphDeps) {
  const host = componentMain.getHost();
  const graphBuilder = new GraphBuilder(host);
  graphql.register(graphSchema(graphBuilder, host));
  return graphBuilder;
}
