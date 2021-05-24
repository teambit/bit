import mapSeries from 'p-map-series';
import { SlotRegistry, Slot } from '@teambit/harmony';
import { flatten } from 'lodash';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ScopeAspect, ScopeMain, ComponentNotFound } from '@teambit/scope';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Component, ComponentID } from '@teambit/component';
import {
  getPublishedPackages,
  updateComponentsByTagResult,
  addFlattenedDependenciesToComponents,
} from '@teambit/legacy/dist/scope/component-ops/tag-model-component';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { BuildStatus, LATEST } from '@teambit/legacy/dist/constants';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { BitId } from '@teambit/legacy-bit-id';
import { getValidVersionOrReleaseType } from '@teambit/legacy/dist/utils/semver-helper';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { exportMany } from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config';
import { UpdateDependenciesCmd } from './update-dependencies.cmd';
import { UpdateDependenciesAspect } from './update-dependencies.aspect';

export type UpdateDepsOptions = {
  tag?: boolean;
  output?: string;
  message?: string;
  username?: string;
  email?: string;
  push?: boolean;
};

export type DepUpdateItemRaw = {
  componentId: string; // ids always have scope, so it's safe to parse them from string
  dependencies: string[]; // e.g. [@teambit/compiler@~1.0.0, @teambit/tester@^1.0.0]
  versionToTag?: string; // specific version or semver. e.g. '1.0.0', 'minor',
};

export type DepUpdateItem = {
  component: Component;
  dependencies: ComponentID[];
  versionToTag?: string;
};

export type UpdateDepsResult = {
  depsUpdateItems: DepUpdateItem[];
  publishedPackages: string[];
  error: string | null;
};

type OnPostUpdateDependencies = (components: Component[]) => Promise<void>;
type OnPostUpdateDependenciesSlot = SlotRegistry<OnPostUpdateDependencies>;

export class UpdateDependenciesMain {
  private depsUpdateItems: DepUpdateItem[];
  private updateDepsOptions: UpdateDepsOptions;
  constructor(
    private scope: ScopeMain,
    private logger: Logger,
    private builder: BuilderMain,
    private dependencyResolver: DependencyResolverMain,
    private onPostUpdateDependenciesSlot: OnPostUpdateDependenciesSlot
  ) {}

  /**
   * we assume this is running from a new bare scope. so we import everything and then start working.
   * we don't want this to be running from the original scope (like bit-sign). this command tags or
   * snaps the results, a process that takes some time due to the build pipeline. if we start the
   * tag on the original scope, build and then save the tag to the filesystem, we might get another
   * tag during the process and our tag could override it.
   */
  async updateDependenciesVersions(
    depsUpdateItemsRaw: DepUpdateItemRaw[],
    updateDepsOptions: UpdateDepsOptions
  ): Promise<UpdateDepsResult> {
    this.updateDepsOptions = updateDepsOptions;
    await this.importAllMissing(depsUpdateItemsRaw);
    this.depsUpdateItems = await this.parseDevUpdatesItems(depsUpdateItemsRaw);
    await this.updateFutureVersion();
    await this.updateAllDeps();
    this.addLogToComponents();
    await addFlattenedDependenciesToComponents(this.scope.legacyScope, this.legacyComponents);
    this.addBuildStatus();
    await this.addComponentsToScope();
    await this.updateComponents();
    // await this.scope.reloadAspectsWithNewVersion(this.legacyComponents);
    await mapSeries(this.components, (component) => this.scope.loadComponentsAspect(component));
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
    await this.saveDataIntoLocalScope(buildStatus);
    await this.export();
    await this.triggerOnPostUpdateDependencies();

    return {
      depsUpdateItems: this.depsUpdateItems,
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

  registerOnPostUpdateDependencies(fn: OnPostUpdateDependencies) {
    this.onPostUpdateDependenciesSlot.register(fn);
  }

  private async triggerOnPostUpdateDependencies() {
    await Promise.all(this.onPostUpdateDependenciesSlot.values().map((fn) => fn(this.components))).catch((err) =>
      this.logger.error('got an error during on-post-updates hook', err)
    );
  }

  private async importAllMissing(depsUpdateItemsRaw: DepUpdateItemRaw[]) {
    const componentIds = depsUpdateItemsRaw.map((d) => ComponentID.fromString(d.componentId));
    const dependenciesIds = depsUpdateItemsRaw.map((item) =>
      item.dependencies.map((dep) => ComponentID.fromString(dep)).map((id) => id.changeVersion(LATEST))
    );
    const idsToImport = [...flatten(dependenciesIds), ...componentIds];
    // do not use cache. for dependencies we must fetch the latest ModelComponent from the remote
    // in order to match the semver later.
    await this.scope.import(idsToImport, false);
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
      await this.updateDependenciesVersionsOfComponent(component, dependencies, currentBitIds);
      await this.updateDependencyResolver(component);
    });
  }

  private async parseDevUpdatesItems(depsUpdateItemsRaw: DepUpdateItemRaw[]): Promise<DepUpdateItem[]> {
    this.logger.setStatusLine(`loading ${depsUpdateItemsRaw.length} components and their aspects...`);
    return mapSeries(depsUpdateItemsRaw, async (depUpdateItemRaw) => {
      const componentId = ComponentID.fromString(depUpdateItemRaw.componentId);
      const component = await this.scope.load(componentId);
      if (!component) throw new ComponentNotFound(componentId);
      const dependencies = await Promise.all(
        depUpdateItemRaw.dependencies.map((dep) => this.getDependencyWithExactVersion(dep))
      );
      return { component, dependencies, versionToTag: depUpdateItemRaw.versionToTag };
    });
  }

  private async getDependencyWithExactVersion(depStr: string): Promise<ComponentID> {
    const compId = ComponentID.fromString(depStr);
    const range = compId.version || '*'; // if not version specified, assume the latest
    const id = compId.changeVersion(undefined);
    const exactVersion = await this.scope.getExactVersionBySemverRange(id, range);
    if (!exactVersion) {
      throw new Error(`unable to find a version that satisfies "${range}" of "${depStr}"`);
    }
    return compId.changeVersion(exactVersion);
  }

  private async updateFutureVersion() {
    this.logger.setStatusLine(`updateFutureVersion...`);
    await mapSeries(this.depsUpdateItems, async (depUpdateItem) => {
      const legacyComp: ConsumerComponent = depUpdateItem.component.state._consumer;
      const modelComponent = await this.scope.legacyScope.getModelComponent(legacyComp.id);
      if (this.updateDepsOptions.tag) {
        const { releaseType, exactVersion } = getValidVersionOrReleaseType(depUpdateItem.versionToTag || 'patch');
        legacyComp.version = modelComponent.getVersionToAdd(releaseType, exactVersion);
      } else {
        // snap is the default
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

  private async updateDependenciesVersionsOfComponent(
    component: Component,
    dependencies: ComponentID[],
    currentBitIds: BitId[]
  ) {
    const depsBitIds = dependencies.map((d) => d._legacy);
    const updatedIds = BitIds.fromArray([...currentBitIds, ...depsBitIds]);
    const componentIdStr = component.id.toString();
    const legacyComponent: ConsumerComponent = component.state._consumer;
    const deps = [...legacyComponent.dependencies.get(), ...legacyComponent.devDependencies.get()];
    const dependenciesList = await this.dependencyResolver.getDependencies(component);
    deps.forEach((dep) => {
      const updatedBitId = updatedIds.searchWithoutVersion(dep.id);
      if (updatedBitId) {
        const depIdStr = dep.id.toString();
        const packageName = dependenciesList.findDependency(depIdStr)?.getPackageName?.();
        if (!packageName) {
          throw new Error(
            `unable to find the package-name of "${depIdStr}" dependency inside the dependency-resolver data of "${componentIdStr}"`
          );
        }
        this.logger.debug(`updating "${componentIdStr}", dependency ${depIdStr} to version ${updatedBitId.version}}`);
        dep.id = updatedBitId;
        dep.packageName = packageName;
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

  private async saveDataIntoLocalScope(buildStatus: BuildStatus) {
    await mapSeries(this.legacyComponents, async (component) => {
      component.buildStatus = buildStatus;
      await this.scope.legacyScope.sources.enrichSource(component);
    });
    await this.scope.legacyScope.objects.persist();
  }

  private async export() {
    const shouldExport = this.updateDepsOptions.push;
    if (!shouldExport) return;
    const ids = BitIds.fromArray(this.legacyComponents.map((c) => c.id));
    await exportMany({
      scope: this.scope.legacyScope,
      isLegacy: false,
      ids,
      codemod: false,
      changeLocallyAlthoughRemoteIsDifferent: false,
      includeDependencies: false,
      remoteName: null,
      idsWithFutureScope: ids,
      allVersions: false,
    });
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, ScopeAspect, LoggerAspect, BuilderAspect, DependencyResolverAspect];

  static slots = [Slot.withType<OnPostUpdateDependenciesSlot>()];

  static async provider(
    [cli, scope, loggerMain, builder, dependencyResolver]: [
      CLIMain,
      ScopeMain,
      LoggerMain,
      BuilderMain,
      DependencyResolverMain
    ],
    _,
    [onPostUpdateDependenciesSlot]: [OnPostUpdateDependenciesSlot]
  ) {
    const logger = loggerMain.createLogger(UpdateDependenciesAspect.id);
    const updateDependenciesMain = new UpdateDependenciesMain(
      scope,
      logger,
      builder,
      dependencyResolver,
      onPostUpdateDependenciesSlot
    );
    cli.register(new UpdateDependenciesCmd(updateDependenciesMain, scope, logger));
    return updateDependenciesMain;
  }
}

UpdateDependenciesAspect.addRuntime(UpdateDependenciesMain);
