import chalk from 'chalk';
import R from 'ramda';
import semver from 'semver';
import { BitError } from '@teambit/bit-error';
import { LaneId } from '@teambit/lane-id';
import pMapSeries from 'p-map-series';
import { isTag } from '@teambit/component-version';
import { getRemoteBitIdsByWildcards } from '@teambit/legacy/dist/api/consumer/lib/list-scope';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { Consumer } from '@teambit/legacy/dist/consumer';
import loader from '@teambit/legacy/dist/cli/loader';
import { BEFORE_IMPORT_ACTION } from '@teambit/legacy/dist/cli/loader/loader-messages';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import ShowDoctorError from '@teambit/legacy/dist/error/show-doctor-error';
import logger from '@teambit/legacy/dist/logger/logger';
import Remotes from '@teambit/legacy/dist/remotes/remotes';
import { ComponentWithDependencies, Scope } from '@teambit/legacy/dist/scope';
import DependencyGraph from '@teambit/legacy/dist/scope/graph/scope-graph';
import { Lane, ModelComponent, Version } from '@teambit/legacy/dist/scope/models';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import Component from '@teambit/legacy/dist/consumer/component';
import { NothingToImport } from '@teambit/legacy/dist/consumer/exceptions';
import { applyModifiedVersion } from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import {
  FileStatus,
  getMergeStrategyInteractive,
  MergeOptions,
  threeWayMerge,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { FilesStatus, MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version/merge-version';
import { MergeResultsThreeWay } from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import ComponentsPendingMerge from '@teambit/legacy/dist/consumer/component-ops/exceptions/components-pending-merge';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import VersionDependencies, {
  multipleVersionDependenciesToConsumer,
} from '@teambit/legacy/dist/scope/version-dependencies';

export type ImportOptions = {
  ids: string[]; // array might be empty
  verbose?: boolean;
  merge?: boolean;
  mergeStrategy?: MergeStrategy;
  writeToPath?: string;
  writeConfig?: boolean;
  override?: boolean;
  installNpmPackages: boolean; // default: true
  objectsOnly?: boolean;
  saveDependenciesAsComponents?: boolean;
  importDependenciesDirectly?: boolean; // default: false, normally it imports them as packages or nested, not as imported
  importDependents?: boolean;
  fromOriginalScope?: boolean; // default: false, otherwise, it fetches flattened dependencies from their dependents
  saveInLane?: boolean; // save the imported component on the current lane (won't be available on main)
  lanes?: {
    laneIds: LaneId[];
    lanes: Lane[]; // it can be an empty array when a lane is a local lane and doesn't exist on the remote
  };
  allHistory?: boolean;
};
type ComponentMergeStatus = {
  componentWithDependencies: ComponentWithDependencies;
  mergeResults: MergeResultsThreeWay | null | undefined;
};
type ImportedVersions = { [id: string]: string[] };
export type ImportStatus = 'added' | 'updated' | 'up to date';
export type ImportDetails = {
  id: string;
  versions: string[];
  latestVersion: string | null;
  status: ImportStatus;
  filesStatus: FilesStatus | null | undefined;
  missingDeps: BitId[];
  deprecated: boolean;
  removed?: boolean;
};
export type ImportResult = {
  dependencies: ComponentWithDependencies[];
  envComponents?: Component[];
  importDetails: ImportDetails[];
  cancellationMessage?: string;
};

export default class ImportComponents {
  consumer: Consumer;
  scope: Scope;
  options: ImportOptions;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  mergeStatus: { [id: string]: FilesStatus };
  private laneObjects: Lane[];
  private divergeData: Array<ModelComponent> = [];
  // @ts-ignore
  constructor(consumer: Consumer, options: ImportOptions) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    this.options = options;
    this.laneObjects = this.options.lanes ? (this.options.lanes.lanes as Lane[]) : [];
  }

  importComponents(): Promise<ImportResult> {
    loader.start(BEFORE_IMPORT_ACTION);
    this.options.saveDependenciesAsComponents = this.consumer.config._saveDependenciesAsComponents;
    if (this.options.lanes && !this.options.ids.length) {
      return this.importObjectsOnLane();
    }
    if (this.options.ids.length) {
      return this.importSpecificComponents();
    }
    return this.importAccordingToBitMap();
  }

  async importObjectsOnLane(): Promise<ImportResult> {
    if (!this.options.objectsOnly) {
      throw new Error(`importObjectsOnLane should have objectsOnly=true`);
    }
    if (this.laneObjects.length > 1) {
      throw new Error(`importObjectsOnLane does not support more than one lane`);
    }
    const lane = this.laneObjects.length ? this.laneObjects[0] : undefined;
    const bitIds: BitIds = await this.getBitIds();
    lane
      ? logger.debug(`importObjectsOnLane, Lane: ${lane.id()}, Ids: ${bitIds.toString()}`)
      : logger.debug(`importObjectsOnLane, the lane does not exist on the remote. importing only the main components`);
    const beforeImportVersions = await this._getCurrentVersions(bitIds);
    const componentsWithDependencies = await this._importComponentsObjects(bitIds, {
      allHistory: this.options.allHistory,
      lane,
    });

    // import lane components from their original scope, this way, it's possible to run diff/merge on them.
    // don't use `scope.getDefaultLaneIdsFromLane()`. we need all components, because it's possible that a component
    // does't have "head" locally although it exits in the origin-scope. it happens when the component was created on
    // the origin-scope after a component with the same-name was created on the lane
    if (lane) {
      // @todo: optimize this maybe. currently, it imports twice.
      // try to make the previous `importComponentsObjectsHarmony` import the same component once from the original
      // scope and once from the lane-scope.
      const mainIdsLatest = BitIds.fromArray(lane.toBitIds().map((m) => m.changeVersion(undefined)));
      await this._importComponentsObjects(mainIdsLatest, {
        allHistory: this.options.allHistory,
        ignoreMissingHead: true,
      });
    }

    // merge the lane objects
    const mergeAllLanesResults = await pMapSeries(this.laneObjects, (laneObject) =>
      this.scope.sources.mergeLane(laneObject, true)
    );
    const mergedLanes = mergeAllLanesResults.map((result) => result.mergeLane);
    await Promise.all(mergedLanes.map((mergedLane) => this.scope.lanes.saveLane(mergedLane)));

    const componentsWithDependenciesFiltered = this._filterComponentsWithLowerVersions(componentsWithDependencies);
    await this._fetchDivergeData(componentsWithDependenciesFiltered);
    this._throwForDivergedHistory();
    await this._writeToFileSystem(componentsWithDependenciesFiltered);
    await this._saveLaneDataIfNeeded(componentsWithDependenciesFiltered);
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsWithDependencies);
    return { dependencies: componentsWithDependenciesFiltered, importDetails };
  }

  async importSpecificComponents(): Promise<ImportResult> {
    logger.debug(`importSpecificComponents, Ids: ${this.options.ids.join(', ')}`);
    const bitIds: BitIds = await this.getBitIds();
    const beforeImportVersions = await this._getCurrentVersions(bitIds);
    await this._throwForPotentialIssues(bitIds);
    const componentsWithDependencies = await this._importComponentsObjects(bitIds, {
      lane: this.laneObjects?.[0],
    });
    if (this.laneObjects && this.options.objectsOnly) {
      // merge the lane objects
      const mergeAllLanesResults = await pMapSeries(this.laneObjects, (laneObject) =>
        this.scope.sources.mergeLane(laneObject, true)
      );
      const mergedLanes = mergeAllLanesResults.map((result) => result.mergeLane);
      await Promise.all(mergedLanes.map((mergedLane) => this.scope.lanes.saveLane(mergedLane)));
    }
    const componentsWithDependenciesFiltered = this._filterComponentsWithLowerVersions(componentsWithDependencies);
    await this._fetchDivergeData(componentsWithDependenciesFiltered);
    this._throwForDivergedHistory();
    await this._writeToFileSystem(componentsWithDependenciesFiltered);
    await this._saveLaneDataIfNeeded(componentsWithDependenciesFiltered);
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsWithDependencies);
    return { dependencies: componentsWithDependenciesFiltered, importDetails };
  }

  async _fetchDivergeData(componentsWithDependencies: ComponentWithDependencies[]) {
    if (this.options.objectsOnly) {
      // no need for it when importing objects only. if it's enabled, in case when on a lane and a non-lane
      // component is in bitmap using an older version, it throws "getDivergeData: unable to find Version X of Y"
      return;
    }
    await Promise.all(
      componentsWithDependencies.map(async ({ component }) => {
        const modelComponent = await this.scope.getModelComponent(component.id);
        await modelComponent.setDivergeData(this.scope.objects, undefined, false);
        this.divergeData.push(modelComponent);
      })
    );
  }

  _throwForDivergedHistory() {
    if (this.options.merge || this.options.objectsOnly) return;
    const divergedComponents = this.divergeData.filter((modelComponent) =>
      modelComponent.getDivergeData().isDiverged()
    );
    if (divergedComponents.length) {
      const divergeData = divergedComponents.map((modelComponent) => ({
        id: modelComponent.id(),
        snapsLocal: modelComponent.getDivergeData().snapsOnLocalOnly.length,
        snapsRemote: modelComponent.getDivergeData().snapsOnRemoteOnly.length,
      }));
      throw new ComponentsPendingMerge(divergeData);
    }
  }

  /**
   * it can happen for example when importing a component with `--dependent` flag and the component has
   * the same dependent with different versions. we only want the one with the higher version
   */
  _filterComponentsWithLowerVersions(
    componentsWithDependencies: ComponentWithDependencies[]
  ): ComponentWithDependencies[] {
    return componentsWithDependencies.filter((comp) => {
      const sameIdHigherVersion = componentsWithDependencies.find(
        (c) =>
          !c.component.id.isEqual(comp.component.id) &&
          c.component.id.isEqualWithoutVersion(comp.component.id) &&
          isTag(c.component.id.version) &&
          isTag(comp.component.id.version) &&
          semver.gt(c.component.id.version as string, comp.component.id.version as string)
      );
      return !sameIdHigherVersion;
    });
  }

  private async _importObjectsDisregardLocalCache(
    ids: BitIds,
    lanes: Lane[] = []
  ): Promise<ComponentWithDependencies[]> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    const versionDependenciesArr: VersionDependencies[] = await scopeComponentsImporter.importMany({
      ids,
      cache: false,
      lanes,
    });
    const componentWithDependencies = await pMapSeries(versionDependenciesArr, (versionDependencies) =>
      versionDependencies.toConsumer(this.scope.objects)
    );
    return componentWithDependencies;
  }

  private async _importComponentsObjects(
    ids: BitIds,
    {
      fromOriginalScope = false,
      allHistory = false,
      lane,
      ignoreMissingHead = false,
    }: {
      fromOriginalScope?: boolean;
      allHistory?: boolean;
      lane?: Lane;
      ignoreMissingHead?: boolean;
    }
  ): Promise<ComponentWithDependencies[]> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    await scopeComponentsImporter.importManyDeltaWithoutDeps(ids, allHistory, lane, ignoreMissingHead);
    loader.start(`import ${ids.length} components with their dependencies (if missing)`);
    const versionDependenciesArr: VersionDependencies[] = fromOriginalScope
      ? await scopeComponentsImporter.importManyFromOriginalScopes(ids)
      : await scopeComponentsImporter.importMany({ ids, ignoreMissingHead, lanes: lane ? [lane] : undefined });
    const componentWithDependencies = await multipleVersionDependenciesToConsumer(
      versionDependenciesArr,
      this.scope.objects
    );

    return componentWithDependencies;
  }

  /**
   * consider the following use cases:
   * 1) no ids were provided. it should import all the lanes components objects AND main components objects
   * (otherwise, if main components are not imported and are missing, then bit-status complains about it)
   * 2) ids are provided with wildcards. we assume the user wants only the ids that are available on the lane.
   * because a user may entered "bit import scope/*" and this scope has many component on the lane and many not on the lane.
   * we want to bring only the components on the lane.
   * 3) ids are provided without wildcards. here, the user knows exactly what's needed and it's ok to get the ids from
   * main if not found on the lane.
   */
  private async getBitIdsForLanes(): Promise<BitId[]> {
    if (!this.options.lanes) {
      throw new Error(`getBitIdsForLanes: this.options.lanes must be set`);
    }
    const bitIdsFromLane = BitIds.fromArray(this.laneObjects.flatMap((lane) => lane.toBitIds()));

    if (!this.options.ids.length) {
      const mainIds = this.consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
      const mainIdsToImport = mainIds.filter((id) => id.hasScope() && !bitIdsFromLane.hasWithoutVersion(id));
      bitIdsFromLane.push(...mainIdsToImport);
      return bitIdsFromLane;
    }

    const idsWithWildcard = this.options.ids.filter((id) => hasWildcard(id));
    const idsWithoutWildcard = this.options.ids.filter((id) => !hasWildcard(id));
    const idsWithoutWildcardPreferFromLane = idsWithoutWildcard.map((idStr) => {
      const id = BitId.parse(idStr, true);
      const fromLane = bitIdsFromLane.searchWithoutVersion(id);
      return fromLane || id;
    });

    const bitIds: BitId[] = [...idsWithoutWildcardPreferFromLane];

    if (!idsWithWildcard) {
      return bitIds;
    }

    await pMapSeries(idsWithWildcard, async (idStr: string) => {
      const idsFromRemote = await getRemoteBitIdsByWildcards(idStr);
      const existingOnLanes = idsFromRemote.filter((id) => bitIdsFromLane.hasWithoutVersion(id));
      if (!existingOnLanes.length) {
        throw new BitError(`the id with the the wildcard "${idStr}" has been parsed to multiple component ids.
however, none of them existing on the lane "${this.laneObjects.map((l) => l.name).join(', ')}"
in case you intend to import these components from main, please run the following:
bit import ${idsFromRemote.map((id) => id.toStringWithoutVersion()).join(' ')}`);
      }
      bitIds.push(...existingOnLanes);
    });

    return bitIds;
  }

  private async getBitIdsForNonLanes() {
    const bitIds: BitId[] = [];
    await Promise.all(
      this.options.ids.map(async (idStr: string) => {
        if (hasWildcard(idStr)) {
          const ids = await getRemoteBitIdsByWildcards(idStr);
          loader.start(BEFORE_IMPORT_ACTION); // it stops the previous loader of BEFORE_REMOTE_LIST
          bitIds.push(...ids);
        } else {
          bitIds.push(BitId.parse(idStr, true)); // we don't support importing without a scope name
        }
      })
    );

    return bitIds;
  }

  private async getBitIds(): Promise<BitIds> {
    const bitIds: BitId[] = this.options.lanes ? await this.getBitIdsForLanes() : await this.getBitIdsForNonLanes();
    if (this.options.importDependenciesDirectly || this.options.importDependents) {
      const graphs = await this._getComponentsGraphs(bitIds);
      if (this.options.importDependenciesDirectly) {
        const dependenciesIds = this._getDependenciesFromGraph(bitIds, graphs);
        bitIds.push(...dependenciesIds);
      }
      if (this.options.importDependents) {
        const dependentsIds = this._getDependentsFromGraph(bitIds, graphs);
        bitIds.push(...dependentsIds);
      }
    }
    return BitIds.uniqFromArray(bitIds);
  }

  _getDependenciesFromGraph(bitIds: BitId[], graphs: DependencyGraph[]): BitId[] {
    const dependencies = bitIds.map((bitId) => {
      const componentGraph = graphs.find((graph) => graph.scopeName === bitId.scope);
      if (!componentGraph) {
        throw new Error(`unable to find a graph for ${bitId.toString()}`);
      }
      const dependenciesInfo = componentGraph.getDependenciesInfo(bitId);
      return dependenciesInfo.map((d) => d.id);
    });
    return R.flatten(dependencies);
  }

  _getDependentsFromGraph(bitIds: BitId[], graphs: DependencyGraph[]): BitId[] {
    const dependents = bitIds.map((bitId) => {
      const componentGraph = graphs.find((graph) => graph.scopeName === bitId.scope);
      if (!componentGraph) {
        throw new Error(`unable to find a graph for ${bitId.toString()}`);
      }
      const dependentsInfo = componentGraph.getDependentsInfo(bitId);
      return dependentsInfo.map((d) => d.id);
    });
    return R.flatten(dependents);
  }

  async _getComponentsGraphs(bitIds: BitId[]): Promise<DependencyGraph[]> {
    const remotes: Remotes = await getScopeRemotes(this.consumer.scope);
    return remotes.scopeGraphs(bitIds, this.consumer.scope);
  }

  async importAccordingToBitMap(): Promise<ImportResult> {
    this.options.objectsOnly = !this.options.merge && !this.options.override;
    const componentsIdsToImport = this.getIdsToImportFromBitmap();

    if (R.isEmpty(componentsIdsToImport)) {
      throw new NothingToImport();
    }
    await this._throwForModifiedOrNewComponents(componentsIdsToImport);
    const beforeImportVersions = await this._getCurrentVersions(componentsIdsToImport);

    let componentsAndDependencies: ComponentWithDependencies[] = [];
    if (componentsIdsToImport.length) {
      // change all ids version to 'latest'. otherwise, it tries to import local tags/snaps from a remote
      // const idsWithLatestVersion = componentsIdsToImport.toVersionLatest();
      if (!this.options.objectsOnly) {
        throw new Error(`bit import with no ids and --merge flag was not implemented yet`);
      }
      componentsAndDependencies = await this._importComponentsObjects(componentsIdsToImport, {
        fromOriginalScope: this.options.fromOriginalScope,
        allHistory: this.options.allHistory,
      });
      await this._writeToFileSystem(componentsAndDependencies);
    }
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsAndDependencies);

    return { dependencies: componentsAndDependencies, importDetails };
  }

  private getIdsToImportFromBitmap() {
    const authoredExportedComponents = this.consumer.bitMap.getExportedComponents();
    return BitIds.fromArray(authoredExportedComponents);
  }

  async _getCurrentVersions(ids: BitIds): Promise<ImportedVersions> {
    const versionsP = ids.map(async (id) => {
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id.changeVersion(undefined));
      const idStr = id.toStringWithoutVersion();
      if (!modelComponent) return [idStr, []];
      return [idStr, modelComponent.listVersions()];
    });
    const versions = await Promise.all(versionsP);
    return R.fromPairs(versions);
  }

  /**
   * get import details, includes the diff between the versions array before import and after import
   */
  async _getImportDetails(
    currentVersions: ImportedVersions,
    components: ComponentWithDependencies[]
  ): Promise<ImportDetails[]> {
    const detailsP = components.map(async (component) => {
      const id = component.component.id;
      const idStr = id.toStringWithoutVersion();
      const beforeImportVersions = currentVersions[idStr];
      if (!beforeImportVersions) {
        throw new Error(
          `_getImportDetails failed finding ${idStr} in currentVersions, which has ${Object.keys(currentVersions).join(
            ', '
          )}`
        );
      }
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id);
      if (!modelComponent) throw new ShowDoctorError(`imported component ${idStr} was not found in the model`);
      const afterImportVersions = modelComponent.listVersions();
      const versionDifference: string[] = R.difference(afterImportVersions, beforeImportVersions);
      const getStatus = (): ImportStatus => {
        if (!versionDifference.length) return 'up to date';
        if (!beforeImportVersions.length) return 'added';
        return 'updated';
      };
      const filesStatus = this.mergeStatus && this.mergeStatus[idStr] ? this.mergeStatus[idStr] : null;
      const deprecated = await modelComponent.isDeprecated(this.scope.objects);
      const removed = component.component.removed;
      const latestVersion = modelComponent.latest();
      return {
        id: idStr,
        versions: versionDifference,
        latestVersion: versionDifference.includes(latestVersion) ? latestVersion : null,
        status: getStatus(),
        filesStatus,
        missingDeps: component.missingDependencies,
        deprecated,
        removed,
      };
    });
    return Promise.all(detailsP);
  }

  async _throwForPotentialIssues(ids: BitIds): Promise<void> {
    await this._throwForModifiedOrNewComponents(ids);
    this._throwForDifferentComponentWithSameName(ids);
  }

  async _throwForModifiedOrNewComponents(ids: BitIds): Promise<void> {
    // the typical objectsOnly option is when a user cloned a project with components tagged to the source code, but
    // doesn't have the model objects. in that case, calling getComponentStatusById() may return an error as it relies
    // on the model objects when there are dependencies
    if (this.options.override || this.options.objectsOnly || this.options.merge) return;
    const componentsStatuses = await this.consumer.getManyComponentsStatuses(ids);
    const modifiedComponents = componentsStatuses
      .filter(({ status }) => status.modified || status.newlyCreated)
      .map((c) => c.id);
    if (modifiedComponents.length) {
      throw new GeneralError(
        chalk.yellow(
          `unable to import the following components due to local changes, use --merge flag to merge your local changes or --override to override them\n${modifiedComponents.join(
            '\n'
          )} `
        )
      );
    }
  }

  /**
   * Model Component id() calculation uses id.toString() for the hash.
   * If an imported component has scopereadonly name equals to a local name, both will have the exact same
   * hash and they'll override each other.
   */
  _throwForDifferentComponentWithSameName(ids: BitIds): void {
    ids.forEach((id: BitId) => {
      const existingId = this.consumer.getParsedIdIfExist(id.toStringWithoutVersion());
      if (existingId && !existingId.hasScope()) {
        throw new GeneralError(`unable to import ${id.toString()}. the component name conflicted with your local component with the same name.
        it's fine to have components with the same name as long as their scope names are different.
        Make sure to export your component first to get a scope and then try importing again`);
      }
    });
  }

  async _getMergeStatus(componentWithDependencies: ComponentWithDependencies): Promise<ComponentMergeStatus> {
    const component = componentWithDependencies.component;
    const componentStatus = await this.consumer.getComponentStatusById(component.id);
    const mergeStatus: ComponentMergeStatus = { componentWithDependencies, mergeResults: null };
    if (!componentStatus.modified) return mergeStatus;
    const componentModel = await this.consumer.scope.getModelComponent(component.id);
    const existingBitMapBitId = this.consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
    const fsComponent = await this.consumer.loadComponent(existingBitMapBitId);
    const currentlyUsedVersion = existingBitMapBitId.version;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const baseComponent: Version = await componentModel.loadVersion(currentlyUsedVersion, this.consumer.scope.objects);
    const otherComponent: Version = await componentModel.loadVersion(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      component.id.version,
      this.consumer.scope.objects
    );
    const mergeResults = await threeWayMerge({
      consumer: this.consumer,
      otherComponent,
      otherLabel: component.id.version as string,
      currentComponent: fsComponent,
      currentLabel: `${currentlyUsedVersion} modified`,
      baseComponent,
    });
    mergeStatus.mergeResults = mergeResults;
    return mergeStatus;
  }

  /**
   * 1) when there are conflicts and the strategy is "ours", don't write the imported component to
   * the filesystem, only update bitmap.
   *
   * 2) when there are conflicts and the strategy is "theirs", override the local changes by the
   * imported component. (similar to --override)
   *
   * 3) when there is no conflict or there are conflicts and the strategy is manual, write the files
   * according to the merge result. (done by applyModifiedVersion())
   */
  _updateComponentFilesPerMergeStrategy(componentMergeStatus: ComponentMergeStatus): FilesStatus | null | undefined {
    const mergeResults = componentMergeStatus.mergeResults;
    if (!mergeResults) return null;
    const component = componentMergeStatus.componentWithDependencies.component;
    const files = component.files;

    if (mergeResults.hasConflicts && this.options.mergeStrategy === MergeOptions.ours) {
      const filesStatus = {};
      // don't write the files to the filesystem, only bump the bitmap version.
      files.forEach((file) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
      });
      this.consumer.bitMap.updateComponentId(component.id);
      this.consumer.bitMap.hasChanged = true;
      return filesStatus;
    }
    if (mergeResults.hasConflicts && this.options.mergeStrategy === MergeOptions.theirs) {
      const filesStatus = {};
      // the local changes will be overridden (as if the user entered --override flag for this component)
      files.forEach((file) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
      });
      return filesStatus;
    }
    const { filesStatus, modifiedFiles } = applyModifiedVersion(
      component.files,
      mergeResults,
      this.options.mergeStrategy
    );
    component.files = modifiedFiles;

    return filesStatus;
  }

  /**
   * update the component files if they are modified and there is a merge strategy.
   * returns only the components that need to be written to the filesystem
   */
  async updateAllComponentsAccordingToMergeStrategy(
    componentsWithDependencies: ComponentWithDependencies[]
  ): Promise<ComponentWithDependencies[]> {
    if (!this.options.merge) return componentsWithDependencies;
    const componentsStatusP = componentsWithDependencies.map((componentWithDependencies: ComponentWithDependencies) => {
      return this._getMergeStatus(componentWithDependencies);
    });
    const componentsStatus = await Promise.all(componentsStatusP);
    const componentWithConflict = componentsStatus.find(
      (component) => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict && !this.options.mergeStrategy) {
      this.options.mergeStrategy = await getMergeStrategyInteractive();
    }
    this.mergeStatus = {};

    const componentsToWrite = componentsStatus.map((componentStatus) => {
      const filesStatus: FilesStatus | null | undefined = this._updateComponentFilesPerMergeStrategy(componentStatus);
      const componentWithDependencies = componentStatus.componentWithDependencies;
      if (!filesStatus) return componentWithDependencies;
      this.mergeStatus[componentWithDependencies.component.id.toStringWithoutVersion()] = filesStatus;
      const unchangedFiles = Object.keys(filesStatus).filter((file) => filesStatus[file] === FileStatus.unchanged);
      if (unchangedFiles.length === Object.keys(filesStatus).length) {
        // all files are unchanged
        return null;
      }
      return componentWithDependencies;
    });
    const removeNulls = R.reject(R.isNil);
    return removeNulls(componentsToWrite);
  }

  _shouldSaveLaneData(): boolean {
    if (this.options.objectsOnly) {
      return false;
    }
    return this.consumer.isOnLane();
  }

  async _saveLaneDataIfNeeded(componentsWithDependencies: ComponentWithDependencies[]): Promise<void> {
    if (!this._shouldSaveLaneData()) {
      return;
    }
    const currentLane = await this.consumer.getCurrentLaneObject();
    if (!currentLane) {
      return; // user on main
    }
    const idsFromRemoteLanes = BitIds.fromArray(this.laneObjects.flatMap((lane) => lane.toBitIds()));
    const components = componentsWithDependencies.map((c) => c.component);
    await Promise.all(
      components.map(async (comp) => {
        const existOnRemoteLane = idsFromRemoteLanes.has(comp.id);
        if (!existOnRemoteLane && !this.options.saveInLane) {
          this.consumer.bitMap.setComponentProp(comp.id, 'onLanesOnly', false);
          return;
        }
        const modelComponent = await this.scope.getModelComponent(comp.id);
        const ref = modelComponent.getRef(comp.id.version as string);
        if (!ref) throw new Error(`_saveLaneDataIfNeeded unable to get ref for ${comp.id.toString()}`);
        currentLane.addComponent({ id: comp.id, head: ref });
      })
    );
    await this.scope.lanes.saveLane(currentLane);
  }

  async _writeToFileSystem(componentsWithDependencies: ComponentWithDependencies[]) {
    if (this.options.objectsOnly) {
      return;
    }
    const componentsToWrite = await this.updateAllComponentsAccordingToMergeStrategy(componentsWithDependencies);
    const manyComponentsWriter = new ManyComponentsWriter({
      consumer: this.consumer,
      componentsWithDependencies: componentsToWrite,
      writeToPath: this.options.writeToPath,
      writeConfig: this.options.writeConfig,
      installNpmPackages: this.options.installNpmPackages,
      verbose: this.options.verbose,
      override: this.options.override,
    });
    await manyComponentsWriter.writeAll();
  }
}
