import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ComponentMain, ComponentAspect, Component, ComponentID } from '@teambit/component';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { ComponentIdObj } from '@teambit/component-id';
import { DeprecationAspect } from './deprecation.aspect';
import { deprecationSchema } from './deprecation.graphql';
import { DeprecationFragment } from './deprecation.fragment';
import { DeprecateCmd } from './deprecate-cmd';
import { UndeprecateCmd } from './undeprecate-cmd';

export type DeprecationInfo = {
  isDeprecate: boolean;
  newId?: string;
};

export type DeprecationMetadata = {
  deprecate?: boolean;
  newId?: ComponentIdObj;
};

export class DeprecationMain {
  constructor(private scope: ScopeMain, private workspace: Workspace) {}
  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ScopeAspect, ComponentAspect, WorkspaceAspect, CLIAspect];

  async getDeprecationInfo(component: Component): Promise<DeprecationInfo> {
    const data = component.config.extensions.findExtension(DeprecationAspect.id)?.config as
      | DeprecationMetadata
      | undefined;
    const deprecatedBackwardCompatibility = component.state._consumer.deprecated;
    const isDeprecate = Boolean(data?.deprecate || deprecatedBackwardCompatibility);
    const newId = data?.newId ? ComponentID.fromObject(data?.newId).toString() : undefined;
    return {
      isDeprecate,
      newId,
    };
  }

  /**
   * mark a component as deprecated. after this change, the component will be modified.
   * tag and export the component to have it deprecated on the remote.
   *
   * @param componentId
   * @param newId
   * @returns boolean whether or not the component has been deprecated
   */
  async deprecate(componentId: ComponentID, newId?: ComponentID): Promise<boolean> {
    const results = this.workspace.bitMap.addComponentConfig(componentId, DeprecationAspect.id, {
      deprecate: true,
      newId: newId?.toObject(),
    });
    await this.workspace.bitMap.write();

    return results;
  }

  async unDeprecate(componentId: ComponentID) {
    const results = this.workspace.bitMap.addComponentConfig(componentId, DeprecationAspect.id, {
      deprecate: false,
      newId: '',
    });
    await this.workspace.bitMap.write();

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
    cli.register(new DeprecateCmd(deprecation, workspace), new UndeprecateCmd(deprecation, workspace));
    componentAspect.registerShowFragments([new DeprecationFragment(deprecation)]);
    graphql.register(deprecationSchema(deprecation));

    return deprecation;
  }
}

DeprecationAspect.addRuntime(DeprecationMain);
