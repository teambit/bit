import { deprecate, undeprecate } from '@teambit/legacy/dist/api/scope';
import { MainRuntime } from '@teambit/cli';
import { ComponentMain, ComponentAspect, Component } from '@teambit/component';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { DeprecationAspect } from './deprecation.aspect';
import { deprecationSchema } from './deprecation.graphql';
import { DeprecationFragment } from './deprecation.fragment';

export type DeprecationInfo = {
  isDeprecate: boolean;
};

export class DeprecationMain {
  constructor(private scope: ScopeMain) {}
  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ScopeAspect, ComponentAspect];

  getDeprecationInfo(component: Component): DeprecationInfo {
    const deprecated = component.state._consumer.deprecated;
    const isDeprecate = !!deprecated;
    return {
      isDeprecate,
    };
  }

  async deprecate(ids: string[]) {
    return deprecate({ path: this.scope.path, ids }, null);
  }

  async unDeprecate(ids: string[]) {
    return undeprecate({ path: this.scope.path, ids }, null);
  }

  static async provider([graphql, scope, componentAspect]: [GraphqlMain, ScopeMain, ComponentMain]) {
    const deprecation = new DeprecationMain(scope);
    componentAspect.registerShowFragments([new DeprecationFragment(deprecation)]);
    graphql.register(deprecationSchema(deprecation));
  }
}

DeprecationAspect.addRuntime(DeprecationMain);
