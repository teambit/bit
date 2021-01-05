import mapSeries from 'p-map-series';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ScopeAspect, ScopeMain, ComponentNotFound } from '@teambit/scope';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Component, ComponentID } from '@teambit/component';
import {
  getPublishedPackages,
  updateComponentsByTagResult,
  addFlattenedDependenciesToComponents,
} from 'bit-bin/dist/scope/component-ops/tag-model-component';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { BuildStatus } from 'bit-bin/dist/constants';
import { getScopeRemotes } from 'bit-bin/dist/scope/scope-remotes';
import { PostSign } from 'bit-bin/dist/scope/actions';
import { ObjectList } from 'bit-bin/dist/scope/objects/object-list';
import { Remotes } from 'bit-bin/dist/remotes';
import { BitIds, BitId } from 'bit-bin/dist/bit-id';
import { getValidVersionOrReleaseType } from 'bit-bin/dist/utils/semver-helper';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config';
import { UpdateDependenciesCmd } from './update-dependencies.cmd';
import { UpdateDependenciesAspect } from './update-dependencies.aspect';

export type UpdateDepsOptions = {
  tag?: boolean;
  snap?: boolean;
  output?: string;
  multiple?: boolean;
  message?: string;
  username?: string;
  email?: string;
};

export type DepUpdateItemRaw = {
  componentId: string; // ids always have scope, so it's safe to parse them from string
  dependencies: string[]; // e.g. [@teambit/compiler@~1.0.0, @teambit/tester@^1.0.0]
  versionToTag?: string; // specific version or semver. e.g. '1.0.0', 'minor',
};

export type DepUpdateItem = {
  component: Component; // ids always have scope, so it's safe to parse them from string
  dependencies: ComponentID[]; // e.g. [@teambit/compiler@~1.0.0, @teambit/tester@^1.0.0]
  versionToTag?: string; // specific version or semver. e.g. '1.0.0', 'minor',
};

export type SignResult = {
  components: Component[];
  publishedPackages: string[];
  error: string | null;
};

export class UpdateDependenciesMain {
  private depsUpdateItems: DepUpdateItem[];
  private updateDepsOptions: UpdateDepsOptions;
  constructor(
    private scope: ScopeMain,
    private logger: Logger,
    private builder: BuilderMain,
    private dependencyResolver: DependencyResolverMain
  ) {}

  async updateDependencies(
    depsUpdateItemsRaw: DepUpdateItemRaw[],
    updateDepsOptions: UpdateDepsOptions
  ): Promise<SignResult> {
    this.updateDepsOptions = updateDepsOptions;
    const componentIds = depsUpdateItemsRaw.map((d) => ComponentID.fromString(d.componentId));
    if (updateDepsOptions.multiple) await this.scope.import(componentIds);
    this.depsUpdateItems = await this.parseDevUpdatesItems(depsUpdateItemsRaw);
    await this.updateFutureVersion();
    await this.updateAllDeps();
    this.addLogToComponents();
    await addFlattenedDependenciesToComponents(this.scope.legacyScope, this.legacyComponents);
    this.addBuildStatus();
    await this.addComponentsToScope();
    await this.updateComponents();
    const { builderDataMap, pipeResults } = await this.builder.tagListener(
      this.components,
      { throwOnError: true }, // we might change it later to not throw.
      { seedersOnly: true }
    );
    const legacyBuildResults = this.scope.builderDataMapToLegacyOnTagResults(builderDataMap);
    updateComponentsByTagResult(this.legacyComponents, legacyBuildResults);
    const publishedPackages = getPublishedPackages(this.legacyComponents);
    const pipeWithError = pipeResults.find((pipe) => pipe.hasErrors());
    const buildStatus = pipeWithError ? BuildStatus.Failed : BuildStatus.Succeed;
    await this.saveExtensionsDataIntoScope(buildStatus);
    // if (isMultiple) {
    //   await this.exportExtensionsDataIntoScopes(legacyComponents, buildStatus);
    // } else {
    // }
    await this.clearScopesCaches();

    return {
      components: this.components,
      publishedPackages,
      error: pipeWithError ? pipeWithError.getErrorMessageFormatted() : null,
    };
  }

  get legacyComponents(): ConsumerComponent[] {
    return this.depsUpdateItems.map((d) => d.component.state._consumer);
  }
  get components(): Component[] {
    return this.depsUpdateItems.map((d) => d.component);
  }

  private async addComponentsToScope() {
    await mapSeries(this.legacyComponents, (component) => this.scope.legacyScope.sources.addSourceFromScope(component));
  }

  private async updateComponents() {
    await mapSeries(this.depsUpdateItems, async (depUpdateItem) => {
      const legacyComp: ConsumerComponent = depUpdateItem.component.state._consumer;
      depUpdateItem.component = await this.scope.getFromConsumerComponent(legacyComp);
    });
  }

  private addBuildStatus() {
    this.legacyComponents.forEach((c) => {
      c.buildStatus = BuildStatus.Pending;
    });
  }

  private addLogToComponents() {
    this.legacyComponents.forEach((component) => {
      component.log = {
        username: this.updateDepsOptions.username || 'ci',
        email: this.updateDepsOptions.email || 'ci@bit.dev',
        message: this.updateDepsOptions.message || 'update-dependencies',
        date: Date.now().toString(),
      };
    });
  }

  private async updateAllDeps() {
    const components = this.depsUpdateItems.map((d) => d.component);
    // current bit ids are needed because we might update multiple components that are depend on
    // each other. in which case, we want the dependency version to be the same as the currently
    // tagged/snapped component.
    const currentBitIds = components.map((c) => c.id._legacy);
    await mapSeries(this.depsUpdateItems, async ({ component, dependencies }) => {
      this.updateDependenciesOfComponent(component, dependencies, currentBitIds);
      await this.updateDependencyResolver(component);
    });
  }

  private async parseDevUpdatesItems(depsUpdateItemsRaw: DepUpdateItemRaw[]): Promise<DepUpdateItem[]> {
    return mapSeries(depsUpdateItemsRaw, async (depUpdateItemRaw) => {
      const componentId = ComponentID.fromString(depUpdateItemRaw.componentId);
      const component = await this.scope.get(componentId);
      if (!component) throw new ComponentNotFound(componentId);
      // it's probably better not to use `this.scope.resolveComponentId` as the dependency might not
      // be in the scope.
      const dependencies = depUpdateItemRaw.dependencies.map((d) => ComponentID.fromString(d));
      return { component, dependencies, versionToTag: depUpdateItemRaw.versionToTag };
    });
  }

  private async updateFutureVersion() {
    await mapSeries(this.depsUpdateItems, async (depUpdateItem) => {
      const legacyComp: ConsumerComponent = depUpdateItem.component.state._consumer;
      const modelComponent = await this.scope.legacyScope.getModelComponent(legacyComp.id);
      if (this.updateDepsOptions.tag) {
        const { releaseType, exactVersion } = getValidVersionOrReleaseType(depUpdateItem.versionToTag || 'patch');
        legacyComp.version = modelComponent.getVersionToAdd(releaseType, exactVersion);
      } else {
        legacyComp.version = modelComponent.getSnapToAdd();
      }
    });
  }

  private async updateDependencyResolver(component: Component) {
    const dependencies = await this.dependencyResolver.extractDepsFromLegacy(component);
    const extId = DependencyResolverAspect.id;
    const data = { dependencies };
    const existingExtension = component.state._consumer.extensions.findExtension(extId);
    if (existingExtension) {
      // Only merge top level of extension data
      Object.assign(existingExtension.data, data);
      return;
    }
    const extension = new ExtensionDataEntry(undefined, undefined, extId, undefined, data);
    component.state._consumer.extensions.push(extension);
  }

  private updateDependenciesOfComponent(component: Component, dependencies: ComponentID[], currentBitIds: BitId[]) {
    const depsBitIds = dependencies.map((d) => d._legacy);
    const updatedIds = BitIds.fromArray([...currentBitIds, ...depsBitIds]);
    const componentIdStr = component.id.toString();
    const legacyComponent: ConsumerComponent = component.state._consumer;
    const deps = [...legacyComponent.dependencies.get(), ...legacyComponent.devDependencies.get()];
    deps.forEach((dep) => {
      const updatedBitId = updatedIds.searchWithoutVersion(dep.id);
      if (updatedBitId) {
        this.logger.debug(
          `updating "${componentIdStr}", dependency ${dep.id.toString()} to version ${updatedBitId.version}}`
        );
        dep.id = updatedBitId;
      }
    });
    legacyComponent.extensions.forEach((ext) => {
      if (!ext.extensionId) return;
      const updatedBitId = updatedIds.searchWithoutVersion(ext.extensionId);
      if (updatedBitId) {
        this.logger.debug(
          `updating "${componentIdStr}", extension ${ext.extensionId.toString()} to version ${updatedBitId.version}}`
        );
        ext.extensionId = updatedBitId;
      }
    });
  }

  private async clearScopesCaches() {
    const bitIds = BitIds.fromArray(this.legacyComponents.map((c) => c.id));
    const idsGroupedByScope = bitIds.toGroupByScopeName(new BitIds());
    const scopeRemotes: Remotes = await getScopeRemotes(this.scope.legacyScope);
    await Promise.all(
      Object.keys(idsGroupedByScope).map(async (scopeName) => {
        const remote = await scopeRemotes.resolve(scopeName, this.scope.legacyScope);
        return remote.action(PostSign.name, { ids: idsGroupedByScope[scopeName].map((id) => id.toString()) });
      })
    );
  }

  private async saveExtensionsDataIntoScope(buildStatus: BuildStatus) {
    await mapSeries(this.legacyComponents, async (component) => {
      component.buildStatus = buildStatus;
      await this.scope.legacyScope.sources.enrichSource(component);
    });
    await this.scope.legacyScope.objects.persist();
  }

  private async exportExtensionsDataIntoScopes(components: ConsumerComponent[], buildStatus: BuildStatus) {
    const scopeRemotes: Remotes = await getScopeRemotes(this.scope.legacyScope);
    const objectListPerScope: { [scopeName: string]: ObjectList } = {};
    await mapSeries(components, async (component) => {
      component.buildStatus = buildStatus;
      const objects = await this.scope.legacyScope.sources.getObjectsToEnrichSource(component);
      const scopeName = component.scope as string;
      const objectList = await ObjectList.fromBitObjects(objects);
      if (objectListPerScope[scopeName]) {
        objectListPerScope[scopeName].mergeObjectList(objectList);
      } else {
        objectListPerScope[scopeName] = objectList;
      }
    });
    await mapSeries(Object.keys(objectListPerScope), async (scopeName) => {
      const remote = await scopeRemotes.resolve(scopeName, this.scope.legacyScope);
      const objectList = objectListPerScope[scopeName];
      this.logger.setStatusLine(`transferring ${objectList.count()} objects to the remote "${remote.name}"...`);
      await remote.pushMany(objectList, { persist: true });
    });
  }

  private async getComponentIdsToSign(
    ids: ComponentID[]
  ): Promise<{
    componentsToSkip: ComponentID[];
    componentsToSign: ComponentID[];
  }> {
    // using `loadComponents` instead of `getMany` to make sure component aspects are loaded.
    this.logger.setStatusLine(`loading ${ids.length} components and their extensions...`);
    const components = await this.scope.loadMany(ids);
    this.logger.clearStatusLine();
    const componentsToSign: ComponentID[] = [];
    const componentsToSkip: ComponentID[] = [];
    components.forEach((component) => {
      if (component.state._consumer.buildStatus === BuildStatus.Succeed) {
        componentsToSkip.push(component.id);
      } else {
        componentsToSign.push(component.id);
      }
    });
    return { componentsToSkip, componentsToSign };
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, ScopeAspect, LoggerAspect, BuilderAspect, DependencyResolverAspect];

  static async provider([cli, scope, loggerMain, builder, dependencyResolver]: [
    CLIMain,
    ScopeMain,
    LoggerMain,
    BuilderMain,
    DependencyResolverMain
  ]) {
    const logger = loggerMain.createLogger(UpdateDependenciesAspect.id);
    const updateDependenciesMain = new UpdateDependenciesMain(scope, logger, builder, dependencyResolver);
    cli.register(new UpdateDependenciesCmd(updateDependenciesMain, scope, logger));
    return updateDependenciesMain;
  }
}

UpdateDependenciesAspect.addRuntime(UpdateDependenciesMain);
