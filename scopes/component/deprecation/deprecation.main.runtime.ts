import { deprecate, undeprecate } from '@teambit/legacy/dist/api/scope';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ComponentMain, ComponentAspect, Component } from '@teambit/component';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { DeprecationAspect } from './deprecation.aspect';
import { deprecationSchema } from './deprecation.graphql';
import { DeprecationFragment } from './deprecation.fragment';
import { DeprecateCmd } from './deprecate-cmd';
import { UndeprecateCmd } from './undeprecate-cmd';

export type DeprecationInfo = {
  isDeprecate: boolean;
};

export type DeprecationMetadata = {
  deprecate: boolean;
  newId?: string;
};

export class DeprecationMain {
  constructor(private scope: ScopeMain, private workspace: Workspace) {}
  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ScopeAspect, ComponentAspect, WorkspaceAspect, CLIAspect];

  getDeprecationInfo(component: Component): DeprecationInfo {
    const deprecated = component.state._consumer.deprecated;
    const isDeprecate = !!deprecated;
    return {
      isDeprecate,
    };
  }

  async deprecate(id: string, newId?: string) {
    const componentId = await this.workspace.resolveComponentId(id);
    const results = await this.workspace.addComponentMetadata(DeprecationAspect.id, componentId, {
      deprecate: true,
      newId,
    });

    return results;
  }

  async unDeprecate(id: string) {
    const componentId = await this.workspace.resolveComponentId(id);
    const results = await this.workspace.addComponentMetadata(DeprecationAspect.id, componentId, {
      deprecate: false,
      newId: '',
    });

    return results;
  }

  static async provider([graphql, scope, componentAspect, workspace, cli]: [
    GraphqlMain,
    ScopeMain,
    ComponentMain,
    Workspace,
    CLIMain
  ]) {
    const deprecation = new DeprecationMain(scope, workspace);
    cli.register(new DeprecateCmd(deprecation), new UndeprecateCmd(deprecation));
    componentAspect.registerShowFragments([new DeprecationFragment(deprecation)]);
    graphql.register(deprecationSchema(deprecation));
  }
}

DeprecationAspect.addRuntime(DeprecationMain);
