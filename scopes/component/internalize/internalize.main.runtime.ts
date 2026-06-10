import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { ComponentMain, Component } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { ComponentID } from '@teambit/component-id';
import { compact } from 'lodash';
import { InternalizeAspect } from './internalize.aspect';
import { internalizeSchema } from './internalize.graphql';
import { InternalizeFragment } from './internalize.fragment';
import { InternalizeCmd } from './internalize-cmd';

export type InternalInfo = {
  isInternal: boolean;
};

export type InternalizeMetadata = {
  /**
   * whether the head is marked as internal.
   */
  internal?: boolean;
};

export class InternalizeMain {
  constructor(
    private scope: ScopeMain,
    private workspace: Workspace
  ) {}

  async getInternalInfo(component: Component): Promise<InternalInfo> {
    const headComponent = await this.getHeadComponent(component);
    const data = headComponent.config.extensions.findExtension(InternalizeAspect.id)?.config as
      | InternalizeMetadata
      | undefined;
    return {
      isInternal: Boolean(data?.internal),
    };
  }

  private async getHeadComponent(component: Component): Promise<Component> {
    if (
      component.id.version &&
      component.head &&
      component.id.version !== component.head?.hash &&
      component.id.version !== component.headTag?.version.version
    ) {
      const headComp = this.workspace // if workspace exists, prefer using the workspace as it may be modified
        ? await this.workspace.get(component.id.changeVersion(undefined))
        : await this.scope.get(component.id.changeVersion(component.head.hash));
      if (!headComp) throw new Error(`unable to get the head of ${component.id.toString()}`);
      return headComp;
    }
    return component;
  }

  /**
   * mark components as internal. after this change, the components will be modified.
   * tag/snap and export them to have them internal on the remote.
   * internal components are still versioned and exported, but hidden by default in the UI.
   *
   * @returns the component-ids that have been changed.
   */
  async internalize(componentIds: ComponentID[]): Promise<ComponentID[]> {
    return this.setInternalConfig(componentIds, true);
  }

  /**
   * remove the internal mark from components.
   * @returns the component-ids that have been changed.
   */
  async uninternalize(componentIds: ComponentID[]): Promise<ComponentID[]> {
    return this.setInternalConfig(componentIds, false);
  }

  /**
   * mark/unmark components matching the given pattern as internal.
   */
  async setByPattern(pattern: string, revert = false): Promise<ComponentID[]> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    return revert ? this.uninternalize(componentIds) : this.internalize(componentIds);
  }

  /**
   * list the workspace components that are currently marked as internal.
   */
  async listInternal(): Promise<ComponentID[]> {
    const ids = this.workspace.listIds();
    const comps = await this.workspace.getMany(ids);
    const results = await Promise.all(
      comps.map(async (comp) => ((await this.getInternalInfo(comp)).isInternal ? comp.id : undefined))
    );
    return compact(results);
  }

  private async setInternalConfig(componentIds: ComponentID[], internal: boolean): Promise<ComponentID[]> {
    const changed = componentIds.filter((id) =>
      this.workspace.bitMap.addComponentConfig(id, InternalizeAspect.id, { internal })
    );
    if (changed.length) {
      const action = internal ? 'internalize' : 'uninternalize';
      const reason =
        changed.length === 1 ? `${action} ${changed[0].toString()}` : `${action} ${changed.length} components`;
      await this.workspace.bitMap.write(reason);
    }
    return changed;
  }

  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ScopeAspect, ComponentAspect, WorkspaceAspect, CLIAspect];
  static async provider([graphql, scope, componentAspect, workspace, cli]: [
    GraphqlMain,
    ScopeMain,
    ComponentMain,
    Workspace,
    CLIMain,
  ]) {
    const internalize = new InternalizeMain(scope, workspace);
    cli.register(new InternalizeCmd(internalize));
    componentAspect.registerShowFragments([new InternalizeFragment(internalize)]);
    graphql.register(() => internalizeSchema(internalize));

    return internalize;
  }
}

InternalizeAspect.addRuntime(InternalizeMain);
