import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import semver from 'semver';
import { BitError } from '@teambit/bit-error';
import type { ComponentMain, Component } from '@teambit/component';
import { ComponentAspect, ComponentID } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { ComponentIdObj } from '@teambit/component-id';
import { DeprecationAspect } from './deprecation.aspect';
import { deprecationSchema } from './deprecation.graphql';
import { DeprecationFragment } from './deprecation.fragment';
import { DeprecateCmd } from './deprecate-cmd';
import { UndeprecateCmd } from './undeprecate-cmd';
import type { IssuesMain } from '@teambit/issues';
import { IssuesAspect } from '@teambit/issues';
import pMapSeries from 'p-map-series';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { compact } from 'lodash';
import { IssuesClasses } from '@teambit/component-issues';

export type DeprecationInfo = {
  isDeprecate: boolean;
  newId?: string;
  range?: string;
};

export type DeprecateByPatternResult = {
  /**
   * components that were deprecated as a result of this operation.
   */
  deprecated: ComponentID[];
  /**
   * components that matched the pattern but were already deprecated (no changes made).
   */
  alreadyDeprecated: ComponentID[];
};

export type UnDeprecateByPatternResult = {
  /**
   * components whose deprecation status was removed as a result of this operation.
   */
  undeprecated: ComponentID[];
  /**
   * components that matched the pattern but were not deprecated (no changes made).
   */
  notDeprecated: ComponentID[];
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
  constructor(
    private scope: ScopeMain,
    private workspace: Workspace,
    private depsResolver: DependencyResolverMain
  ) {}

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
    const results = this.setDeprecateConfig(componentId, newId, range);
    await this.workspace.bitMap.write(`deprecate ${componentId.toString()}`);

    return results;
  }

  async deprecateByCLIValues(id: string, newId?: string, range?: string): Promise<boolean> {
    const componentId = await this.workspace.resolveComponentId(id);
    const newComponentId = newId ? await this.workspace.resolveComponentId(newId) : undefined;
    return this.deprecate(componentId, newComponentId, range);
  }

  /**
   * deprecate all components matching the given pattern. the pattern can match multiple components.
   * see `COMPONENT_PATTERN_HELP` for the supported pattern syntax.
   */
  async deprecateByPattern(pattern: string, newId?: string, range?: string): Promise<DeprecateByPatternResult> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    // reject the invalid multi-match + --new-id combination before resolving newId, so we don't
    // trigger registry/package-name resolution (which can fail) for a command that's already invalid.
    if (newId && componentIds.length > 1) {
      throw new BitError(
        `--new-id sets a single replacement component, but the pattern "${pattern}" matched ${componentIds.length} components.
run the command per-component to use --new-id, or remove it to deprecate them all`
      );
    }
    const newComponentId = newId ? await this.workspace.resolveComponentId(newId) : undefined;
    const deprecated: ComponentID[] = [];
    const alreadyDeprecated: ComponentID[] = [];
    await pMapSeries(componentIds, async (componentId) => {
      // when the component is already deprecated and there's no replacement/range to (re)set, there's
      // nothing to change. bucketing by the actual deprecated-state (bitmap + model) rather than by the
      // bitmap config-diff avoids re-writing redundant config (e.g. for "$deprecated" matches) and
      // reporting already-deprecated components as newly deprecated.
      if (!newComponentId && !range && (await this.isDeprecated(componentId))) {
        alreadyDeprecated.push(componentId);
        return;
      }
      this.setDeprecateConfig(componentId, newComponentId, range);
      deprecated.push(componentId);
    });
    if (deprecated.length) {
      await this.workspace.bitMap.write(`deprecate ${pattern}`);
    }

    return { deprecated, alreadyDeprecated };
  }

  async unDeprecateByCLIValues(id: string): Promise<boolean> {
    const componentId = await this.workspace.resolveComponentId(id);
    return this.unDeprecate(componentId);
  }

  async unDeprecate(componentId: ComponentID) {
    const results = this.setUnDeprecateConfig(componentId);
    await this.workspace.bitMap.write(`undeprecate ${componentId.toString()}`);

    return results;
  }

  /**
   * remove the deprecation status from all components matching the given pattern.
   * the pattern can match multiple components. see `COMPONENT_PATTERN_HELP` for the supported pattern syntax.
   */
  async unDeprecateByPattern(pattern: string): Promise<UnDeprecateByPatternResult> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const undeprecated: ComponentID[] = [];
    const notDeprecated: ComponentID[] = [];
    await pMapSeries(componentIds, async (componentId) => {
      // only undeprecate components that actually have a deprecation to clear (incl. range-deprecations,
      // which are stored with deprecate:false). bucketing by the real state rather than the bitmap
      // config-diff avoids writing a redundant "deprecate: false" config (and marking the component as
      // modified) for components that were never deprecated.
      if (!(await this.hasDeprecationToClear(componentId))) {
        notDeprecated.push(componentId);
        return;
      }
      this.setUnDeprecateConfig(componentId);
      undeprecated.push(componentId);
    });
    if (undeprecated.length) {
      await this.workspace.bitMap.write(`undeprecate ${pattern}`);
    }

    return { undeprecated, notDeprecated };
  }

  /**
   * whether the component is currently deprecated, considering both the pending local .bitmap config
   * (authoritative when present) and the persisted model/scope state.
   */
  private async isDeprecated(componentId: ComponentID): Promise<boolean> {
    const bitmapEntry = this.workspace.bitMap.getBitmapEntryIfExist(componentId, { ignoreVersion: true });
    if (bitmapEntry?.isDeprecated()) return true;
    if (bitmapEntry?.isUndeprecated()) return false;
    return this.isDeprecatedByIdWithoutLoadingComponent(componentId);
  }

  /**
   * whether the component has any deprecation that an undeprecate should clear. unlike isDeprecated(),
   * this also treats a range-deprecation as clearable (whether it lives in the local .bitmap or is
   * already baked into the model), so "bit undeprecate" can revert a prior "bit deprecate --range" even
   * when the head version is outside the range and thus not "currently" deprecated.
   */
  private async hasDeprecationToClear(componentId: ComponentID): Promise<boolean> {
    const bitmapEntry = this.workspace.bitMap.getBitmapEntryIfExist(componentId, { ignoreVersion: true });
    if (bitmapEntry?.isDeprecated() || bitmapEntry?.isDeprecatedByRange()) return true;
    if (bitmapEntry?.isUndeprecated()) return false;
    // no decisive local config — consult the model. use getDeprecationInfo (which reports the configured
    // range regardless of the head version) rather than the version-specific isDeprecated() check.
    const component = await this.workspace.get(componentId);
    const { isDeprecate, range } = await this.getDeprecationInfo(component);
    return isDeprecate || Boolean(range);
  }

  private setDeprecateConfig(componentId: ComponentID, newId?: ComponentID, range?: string): boolean {
    if (range && !semver.validRange(range)) {
      throw new BitError(
        `the range "${range}" is invalid. see https://www.npmjs.com/package/semver#ranges for the range syntax`
      );
    }
    return this.workspace.bitMap.addComponentConfig(componentId, DeprecationAspect.id, {
      deprecate: !range,
      newId: newId?.toObject(),
      range,
    });
  }

  private setUnDeprecateConfig(componentId: ComponentID): boolean {
    return this.workspace.bitMap.addComponentConfig(componentId, DeprecationAspect.id, {
      deprecate: false,
      newId: '',
    });
  }

  async addDeprecatedDependenciesIssues(components: Component[]) {
    await pMapSeries(components, async (component) => {
      await this.addDeprecatedDepIssue(component);
    });
  }

  private async addDeprecatedDepIssue(component: Component) {
    const isSelfDeprecated = await this.isComponentDeprecated(component);
    if (isSelfDeprecated) return;
    const dependencies = this.depsResolver.getComponentDependencies(component);
    const removedWithUndefined = await Promise.all(
      dependencies.map(async (dep) => {
        const isRemoved = await this.isDeprecatedByIdWithoutLoadingComponent(dep.componentId);
        if (isRemoved) return dep.componentId;
        return undefined;
      })
    );
    const removed = compact(removedWithUndefined).map((id) => id.toString());
    if (removed.length) {
      component.state.issues.getOrCreate(IssuesClasses.DeprecatedDependencies).data = removed;
    }
  }

  private async isComponentDeprecated(component: Component): Promise<boolean> {
    if (!component.id.hasVersion()) {
      const bitmapEntry = this.workspace.bitMap.getBitmapEntryIfExist(component.id);
      return Boolean(bitmapEntry && bitmapEntry.isDeprecated());
    }
    return this.isDeprecatedByIdWithoutLoadingComponent(component.id);
  }

  /**
   * performant version of isDeprecated() in case the component object is not available and loading it is expensive.
   */
  private async isDeprecatedByIdWithoutLoadingComponent(componentId: ComponentID): Promise<boolean> {
    if (!componentId.hasVersion()) return false;
    const bitmapEntry = this.workspace.bitMap.getBitmapEntryIfExist(componentId);
    if (bitmapEntry && bitmapEntry.isDeprecated()) return true;
    if (bitmapEntry && bitmapEntry.isUndeprecated()) return false;
    const modelComp = await this.workspace.scope.getBitObjectModelComponent(componentId);
    if (!modelComp) return false;
    const isDeprecated = await modelComp.isDeprecated(
      this.workspace.scope.legacyScope.objects,
      componentId.version as string
    );
    return Boolean(isDeprecated);
  }

  static runtime = MainRuntime;
  static dependencies = [
    GraphqlAspect,
    ScopeAspect,
    ComponentAspect,
    WorkspaceAspect,
    CLIAspect,
    DependencyResolverAspect,
    IssuesAspect,
  ];
  static async provider([graphql, scope, componentAspect, workspace, cli, depsResolver, issues]: [
    GraphqlMain,
    ScopeMain,
    ComponentMain,
    Workspace,
    CLIMain,
    DependencyResolverMain,
    IssuesMain,
  ]) {
    const deprecation = new DeprecationMain(scope, workspace, depsResolver);
    issues.registerAddComponentsIssues(deprecation.addDeprecatedDependenciesIssues.bind(deprecation));
    cli.register(new DeprecateCmd(deprecation), new UndeprecateCmd(deprecation));
    componentAspect.registerShowFragments([new DeprecationFragment(deprecation)]);
    graphql.register(() => deprecationSchema(deprecation));

    return deprecation;
  }
}

DeprecationAspect.addRuntime(DeprecationMain);
