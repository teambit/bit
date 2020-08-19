import { DeprecationAspect } from './deprecation.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { GraphqlAspect, GraphqlMain } from '../graphql';
import { deprecationSchema } from './deprecation.graphql';
import { Component, ComponentAspect } from '../component';

export type DeprecationInfo = {
  isDeprecate: boolean;
};

export class DeprecationMain {
  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ComponentAspect];
  static id = '@teambit/deprecation';

  getDeprecationInfo(component: Component): DeprecationInfo {
    const deprecated = component.state._consumer.deprecated;
    const isDeprecate = !!deprecated;
    return {
      isDeprecate,
    };
  }

  static async provider([graphql]: [GraphqlMain]) {
    const deprecation = new DeprecationMain();
    graphql.register(deprecationSchema(deprecation));
  }
}

DeprecationAspect.addRuntime(DeprecationMain);
