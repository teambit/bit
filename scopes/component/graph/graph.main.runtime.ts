import { MainRuntime } from '@teambit/cli';
import GraphqlAspect from '@teambit/graphql';
import { ComponentAspect } from '@teambit/component';

import { GraphAspect } from './graph.aspect';
import { provide } from './graph.provider';

export const GraphMain = {
  name: 'graph',
  runtime: MainRuntime,
  dependencies: [GraphqlAspect, ComponentAspect],
  provider: provide,
};

GraphAspect.addRuntime(GraphMain);
