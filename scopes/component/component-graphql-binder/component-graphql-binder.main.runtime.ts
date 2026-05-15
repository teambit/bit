import { MainRuntime } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component/dist/component.aspect.js';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql/dist/graphql.aspect.js';
import { componentSchema } from '@teambit/component/dist/component.graphql.js';
import { ComponentGraphqlBinderAspect } from './component-graphql-binder.aspect';

export class ComponentGraphqlBinderMain {
  static runtime = MainRuntime;
  static dependencies = [ComponentAspect, GraphqlAspect];
  static slots = [];
  static async provider([component, graphql]: [ComponentMain, GraphqlMain]) {
    graphql.register(() => componentSchema(component));
    return undefined;
  }
}

ComponentGraphqlBinderAspect.addRuntime(ComponentGraphqlBinderMain);

export default ComponentGraphqlBinderMain;
