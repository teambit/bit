import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { MainRuntime } from '@teambit/cli';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { LanesAspect } from './lanes.aspect';
import { lanesSchema } from './lanes.graphql';

export class LanesMain {
  list() {}

  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ScopeAspect];

  static async provider([graphql]: [GraphqlMain, ScopeMain]) {
    const lanes = new LanesMain();
    graphql.register(lanesSchema(lanes));
    return lanes;
  }
}

LanesAspect.addRuntime(LanesMain);
