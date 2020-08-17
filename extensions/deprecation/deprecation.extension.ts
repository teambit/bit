import { GraphQLExtension } from '@teambit/graphql';
import { deprecationSchema } from './deprecation.graphql';
import { Component, ComponentExtension } from '@teambit/component';

export type DeprecationInfo = {
  isDeprecate: boolean;
};

export class DeprecationExtension {
  static dependencies = [GraphQLExtension, ComponentExtension];
  static id = '@teambit/deprecation';

  getDeprecationInfo(component: Component): DeprecationInfo {
    const deprecated = component.state._consumer.deprecated;
    const isDeprecate = !!deprecated;
    return {
      isDeprecate,
    };
  }

  static async provider([graphql]: [GraphQLExtension]) {
    const deprecation = new DeprecationExtension();
    graphql.register(deprecationSchema(deprecation));
  }
}
