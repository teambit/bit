import { MainRuntime } from '@teambit/cli';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { LanesAspect } from './lanes.aspect';
import { lanesSchema } from './lanes.graphql';

export class LanesMain {
  static runtime = MainRuntime;

  static dependencies = [GraphqlAspect];

  static async provider([graphql]: [GraphqlMain]) {
    const lanes = new LanesMain();
    graphql.register(lanesSchema(lanes));
    return lanes;
  }
}

LanesAspect.addRuntime(LanesMain);
