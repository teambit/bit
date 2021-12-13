import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ComponentMain, ComponentAspect, Component } from '@teambit/component';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { deprecateMany, undeprecateMany } from '@teambit/legacy/dist/scope/component-ops/components-deprecation';
import { BitIds } from '@teambit/legacy/dist/bit-id';
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
  newId?: string;
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
    return {
      isDeprecate,
      newId: data?.newId,
    };
  }

  async deprecate(id: string, newId?: string) {
    if (this.workspace.isLegacy) {
      const bitId = this.workspace.consumer.getParsedId(id);
      await deprecateMany(this.workspace.consumer.scope, new BitIds(bitId));
      return {
        deprecate: true,
      };
    }
    const componentId = await this.workspace.resolveComponentId(id);
    const results = await this.workspace.addComponentConfigToBitmap(DeprecationAspect.id, componentId, {
      deprecate: true,
      newId,
    });

    return results;
  }

  async unDeprecate(id: string) {
    if (this.workspace.isLegacy) {
      const bitId = this.workspace.consumer.getParsedId(id);
      await undeprecateMany(this.workspace.consumer.scope, new BitIds(bitId));
      return {
        deprecate: false,
      };
    }
    const componentId = await this.workspace.resolveComponentId(id);
    const results = await this.workspace.addComponentConfigToBitmap(DeprecationAspect.id, componentId, {
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
