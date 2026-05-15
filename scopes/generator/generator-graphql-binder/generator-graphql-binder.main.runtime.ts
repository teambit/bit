import { MainRuntime } from '@teambit/cli';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator/dist/generator.aspect.js';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql/dist/graphql.aspect.js';
import { generatorSchema } from '@teambit/generator/dist/generator.graphql.js';
import { GeneratorGraphqlBinderAspect } from './generator-graphql-binder.aspect';

export class GeneratorGraphqlBinderMain {
  static runtime = MainRuntime;
  static dependencies = [GeneratorAspect, GraphqlAspect];
  static slots = [];
  static async provider([generator, graphql]: [GeneratorMain, GraphqlMain]) {
    graphql.register(() => generatorSchema(generator));
    return undefined;
  }
}

GeneratorGraphqlBinderAspect.addRuntime(GeneratorGraphqlBinderMain);

export default GeneratorGraphqlBinderMain;
