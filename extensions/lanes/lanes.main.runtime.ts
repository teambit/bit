import { MainRuntime } from '@teambit/cli';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { LanesAspect } from './lanes.aspect';
import { lanesSchema } from './lanes.graphql';
import { ScopeAspect, ScopeMain } from '@teambit/scope';

export class LanesMain {
  list() {}

  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ScopeAspect];

  static async provider([graphql, scope]: [GraphqlMain, ScopeMain]) {
    const lanes = new LanesMain();
    graphql.register(lanesSchema(lanes));
    return lanes;
  }
}

LanesAspect.addRuntime(LanesMain);
