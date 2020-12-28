import { GraphqlMain } from '@teambit/graphql';
import { ComponentMain } from '@teambit/component';

import { GraphBuilder } from './graph-builder';
import { graphSchema } from './graph.graphql';

export type GraphDeps = [GraphqlMain, ComponentMain];

export async function provide([graphql, componentAspect]: GraphDeps): Promise<GraphBuilder> {
  const graphBuilder = new GraphBuilder(componentAspect);
  // TODO: make sure it's working (the host here might be undefined?)
  graphql.register(graphSchema(graphBuilder, componentAspect));
  return graphBuilder;
}
