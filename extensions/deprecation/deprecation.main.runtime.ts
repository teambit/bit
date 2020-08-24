import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';

import { DeprecationAspect } from './deprecation.aspect';
import { deprecationSchema } from './deprecation.graphql';

export type DeprecationInfo = {
  isDeprecate: boolean;
};

export class DeprecationMain {
  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ComponentAspect];

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
