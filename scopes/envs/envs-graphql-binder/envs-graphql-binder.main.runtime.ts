import { MainRuntime } from '@teambit/cli';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs/dist/environments.aspect.js';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql/dist/graphql.aspect.js';
import { environmentsSchema } from '@teambit/envs/dist/environments.graphql';
import { EnvsGraphqlBinderAspect } from './envs-graphql-binder.aspect';

export class EnvsGraphqlBinderMain {
  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, GraphqlAspect];
  static slots = [];
  static async provider([envs, graphql]: [EnvsMain, GraphqlMain]) {
    graphql.register(() => environmentsSchema(envs));
    return undefined;
  }
}

EnvsGraphqlBinderAspect.addRuntime(EnvsGraphqlBinderMain);

export default EnvsGraphqlBinderMain;
