import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import semver from 'semver';
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
  range?: string;
};

export type DeprecationMetadata = {
  /**
   * whether the head is deprecated
   */
  deprecate?: boolean;
  /**
   * the new id to use instead of the current one
   */
  newId?: ComponentIdObj;
  /**
   * Semver range to deprecate previous versions
   */
  range?: string;
};

export class DeprecationMain {
  constructor(private scope: ScopeMain, private workspace: Workspace) {}
  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ScopeAspect, ComponentAspect, WorkspaceAspect, CLIAspect];

  async getDeprecationInfo(component: Component): Promise<DeprecationInfo> {
    const headComponent = await this.getHeadComponent(component);

    const data = headComponent.config.extensions.findExtension(DeprecationAspect.id)?.config as
      | DeprecationMetadata
      | undefined;
    const deprecatedBackwardCompatibility = component.state._consumer.deprecated;
    const isDeprecate = Boolean(data?.deprecate || deprecatedBackwardCompatibility);
    const currentTag = component.getTag();
    const isDeprecateByRange = Boolean(data?.range && currentTag && semver.satisfies(currentTag.version, data.range));
    const newId = data?.newId ? ComponentID.fromObject(data?.newId).toString() : undefined;
    return {
      isDeprecate: isDeprecate || isDeprecateByRange,
      newId,
      range: data?.range,
    };
  }

  private async getHeadComponent(component: Component): Promise<Component> {
    if (
      component.id.version &&
      component.head &&
      component.id.version !== component.head?.hash &&
      component.id.version !== component.headTag?.version.version
    ) {
      const headComp = this.workspace // if workspace exits, prefer using the workspace as it may be modified
        ? await this.workspace.get(component.id.changeVersion(undefined))
        : await this.scope.get(component.id.changeVersion(component.head.hash));
      if (!headComp) throw new Error(`unable to get the head of ${component.id.toString()}`);
      return headComp;
    }
    return component;
  }

  /**
   * mark a component as deprecated. after this change, the component will be modified.
   * tag and export the component to have it deprecated on the remote.
   *
   * @param componentId
   * @param newId
   * @returns boolean whether or not the component has been deprecated
   */
  async deprecate(componentId: ComponentID, newId?: ComponentID, range?: string): Promise<boolean> {
    const results = this.workspace.bitMap.addComponentConfig(componentId, DeprecationAspect.id, {
      deprecate: !range,
      newId: newId?.toObject(),
      range,
    });
    await this.workspace.bitMap.write(`deprecate ${componentId.toString()}`);

    return results;
  }

  async unDeprecate(componentId: ComponentID) {
    const results = this.workspace.bitMap.addComponentConfig(componentId, DeprecationAspect.id, {
      deprecate: false,
      newId: '',
    });
    await this.workspace.bitMap.write(`undeprecate ${componentId.toString()}`);

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
