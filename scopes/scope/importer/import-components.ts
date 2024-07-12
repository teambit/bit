import { BitError } from '@teambit/bit-error';
import { LaneId } from '@teambit/lane-id';
import pMapSeries from 'p-map-series';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { BEFORE_IMPORT_ACTION } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { Scope } from '@teambit/legacy/dist/scope';
import { Lane, ModelComponent, Version } from '@teambit/legacy/dist/scope/models';
import { getLatestVersionNumber, pathNormalizeToLinux, hasWildcard } from '@teambit/legacy.utils';
import Component from '@teambit/legacy/dist/consumer/component';
import { applyModifiedVersion } from '@teambit/checkout';
import {
  FileStatus,
  getMergeStrategyInteractive,
  MergeOptions,
  threeWayMerge,
  MergeStrategy,
  MergeResultsThreeWay,
  FilesStatus,
} from '@teambit/merging';
import ComponentsPendingMerge from '@teambit/legacy/dist/consumer/exceptions/components-pending-merge';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import VersionDependencies, {
  multipleVersionDependenciesToConsumer,
} from '@teambit/legacy/dist/scope/version-dependencies';
import { GraphMain } from '@teambit/graph';
import { Workspace } from '@teambit/workspace';
import { ComponentWriterMain, ComponentWriterResults, ManyComponentsWriterParams } from '@teambit/component-writer';
import { LATEST_VERSION } from '@teambit/component-version';
import { EnvsMain } from '@teambit/envs';
import { compact, difference, fromPairs } from 'lodash';
import { WorkspaceConfigUpdateResult } from '@teambit/config-merger';
import { Logger } from '@teambit/logger';
import { DependentsGetter } from './dependents-getter';
import { ListerMain, NoIdMatchWildcard } from '@teambit/lister';

export type ImportOptions = {
  ids: string[]; // array might be empty
  verbose?: boolean;
  merge?: boolean;
  mergeStrategy?: MergeStrategy;
  filterEnvs?: string[];
  writeToPath?: string;
  writeConfig?: boolean;
  override?: boolean;
  installNpmPackages: boolean; // default: true
  writeConfigFiles: boolean; // default: true
  objectsOnly?: boolean;
  importDependenciesDirectly?: boolean; // default: false, normally it imports them as packages, not as imported
  importHeadDependenciesDirectly?: boolean; // default: false, similar to importDependenciesDirectly, but it checks out to their head
  importDependents?: boolean;
  dependentsVia?: string;
  dependentsAll?: boolean;
  silent?: boolean; // don't show prompt for --dependents flag
  fromOriginalScope?: boolean; // default: false, otherwise, it fetches flattened dependencies from their dependents
  saveInLane?: boolean; // save the imported component on the current lane (won't be available on main)
  lanes?: {
    laneId: LaneId;
    remoteLane?: Lane; // it can be an empty array when a lane is a local lane and doesn't exist on the remote
  };
  allHistory?: boolean;
  fetchDeps?: boolean; // by default, if a component was tagged with > 0.0.900, it has the flattened-deps-graph in the object
  trackOnly?: boolean;
  includeDeprecated?: boolean;
  isLaneFromRemote?: boolean; // whether the `lanes.lane` object is coming directly from the remote.
};
type ComponentMergeStatus = {
  component: Component;
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
  missingDeps: ComponentID[];
  deprecated: boolean;
  removed?: boolean;
};
export type ImportResult = {
  importedIds: ComponentID[];
  importedDeps: ComponentID[];
  writtenComponents?: Component[];
  importDetails: ImportDetails[];
  cancellationMessage?: string;
  installationError?: Error;
  compilationError?: Error;
  workspaceConfigUpdateResult?: WorkspaceConfigUpdateResult;
  missingIds?: string[]; // in case the import is configured to not throw when missing
  lane?: Lane;
};

export default class ImportComponents {
  consumer: Consumer;
  scope: Scope;
  mergeStatus: { [id: string]: FilesStatus };
  private remoteLane: Lane | undefined;
  private divergeData: Array<ModelComponent> = [];
  constructor(
    private workspace: Workspace,
    private graph: GraphMain,
    private componentWriter: ComponentWriterMain,
    private envs: EnvsMain,
    private logger: Logger,
    private lister: ListerMain,
    public options: ImportOptions
  ) {
    this.consumer = this.workspace.consumer;
    this.scope = this.consumer.scope;
    this.remoteLane = this.options.lanes?.remoteLane;
  }

  async importComponents(): Promise<ImportResult> {
    let result;
    this.logger.setStatusLine(BEFORE_IMPORT_ACTION);
    const startTime = process.hrtime();
    if (this.options.lanes && !this.options.ids.length) {
      result = await this.importObjectsOnLane();
      this.logger.consoleSuccess(BEFORE_IMPORT_ACTION, startTime);
      return result;
    }
    if (this.options.ids.length) {
      result = await this.importSpecificComponents();
      this.logger.consoleSuccess(BEFORE_IMPORT_ACTION, startTime);
      return result;
    }
    result = await this.importAccordingToBitMap();
    this.logger.consoleSuccess(BEFORE_IMPORT_ACTION, startTime);
    return result;
  }

  async importObjectsOnLane(): Promise<ImportResult> {
    if (!this.options.objectsOnly) {
      throw new Error(`importObjectsOnLane should have objectsOnly=true`);
    }
    const lane = this.remoteLane;
    const bitIds: ComponentIdList = await this.getBitIds();
    lane
      ? this.logger.debug(`importObjectsOnLane, Lane: ${lane.id()}, Ids: ${bitIds.toString()}`)
      : this.logger.debug(
          `importObjectsOnLane, the lane does not exist on the remote. importing only the main components`
        );
    const beforeImportVersions = await this._getCurrentVersions(bitIds);
    const versionDependenciesArr = await this._importComponentsObjects(bitIds, {
      lane,
    });

    if (lane) {
      await this.mergeAndSaveLaneObject(lane);
    }

    return this.returnCompleteResults(beforeImportVersions, versionDependenciesArr);
  }

  private async returnCompleteResults(
    beforeImportVersions: ImportedVersions,
    versionDependenciesArr: VersionDependencies[],
    writtenComponents?: Component[],
    componentWriterResults?: ComponentWriterResults
  ): Promise<ImportResult> {
    const importDetails = await this._getImportDetails(beforeImportVersions, versionDependenciesArr);
    const missingIds: string[] = [];
    if (Object.keys(beforeImportVersions).length > versionDependenciesArr.length) {
      const importedComps = versionDependenciesArr.map((c) => c.component.id.toStringWithoutVersion());
      Object.keys(beforeImportVersions).forEach((compIdStr) => {
        const found = importedComps.includes(compIdStr);
        if (!found) missingIds.push(compIdStr);
      });
    }

    return {
      importedIds: versionDependenciesArr.map((v) => v.component.id).flat(),
      importedDeps: versionDependenciesArr.map((v) => v.allDependenciesIds).flat(),
      writtenComponents,
      importDetails,
      installationError: componentWriterResults?.installationError,
      compilationError: componentWriterResults?.compilationError,
      workspaceConfigUpdateResult: componentWriterResults?.workspaceConfigUpdateResult,
      missingIds,
      lane: this.remoteLane,
    };
  }

  async importSpecificComponents(): Promise<ImportResult> {
    this.logger.debug(`importSpecificComponents, Ids: ${this.options.ids.join(', ')}`);
    const bitIds: ComponentIdList = await this.getBitIds();
    const beforeImportVersions = await this._getCurrentVersions(bitIds);
    await this._throwForPotentialIssues(bitIds);
    const versionDependenciesArr = await this._importComponentsObjects(bitIds, {
      lane: this.remoteLane,
    });
    if (this.remoteLane && this.options.objectsOnly) {
      await this.mergeAndSaveLaneObject(this.remoteLane);
    }
    let writtenComponents: Component[] = [];
    let componentWriterResults: ComponentWriterResults | undefined;
    if (!this.options.objectsOnly) {
      const components = await multipleVersionDependenciesToConsumer(versionDependenciesArr, this.scope.objects);
      await this._fetchDivergeData(components);
      this._throwForDivergedHistory();
      await this.throwForComponentsFromAnotherLane(components.map((c) => c.id));
      const filteredComponents = await this._filterComponentsByFilters(components);
      componentWriterResults = await this._writeToFileSystem(filteredComponents);
      await this._saveLaneDataIfNeeded(filteredComponents);
      writtenComponents = filteredComponents;
    }

    return this.returnCompleteResults(
      beforeImportVersions,
      versionDependenciesArr,
      writtenComponents,
      componentWriterResults
    );
  }

  private async mergeAndSaveLaneObject(lane: Lane) {
    const mergeLaneResults = await this.scope.sources.mergeLane(lane, true);
    const mergedLane = mergeLaneResults.mergeLane;
    const isRemoteLaneEqualsToMergedLane = lane.isEqual(mergedLane);
    await this.scope.lanes.saveLane(mergedLane, {
      saveLaneHistory: !isRemoteLaneEqualsToMergedLane,
      laneHistoryMsg: 'import (merge from remote)',
    });
  }

  private async _filterComponentsByFilters(components: Component[]): Promise<Component[]> {
    if (!this.options.filterEnvs) return components;
    const filteredP = components.map(async (component) => {
      // If the id was requested explicitly, we don't want to filter it out
      if (this.options.ids) {
        if (
          this.options.ids.includes(component.id.toStringWithoutVersion()) ||
          this.options.ids.includes(component.id.toString())
        ) {
          return component;
        }
      }
      const currentEnv = await this.envs.calculateEnvIdFromExtensions(component.extensions);
      const currentEnvWithoutVersion = currentEnv.split('@')[0];
      if (
        this.options.filterEnvs?.includes(currentEnv) ||
        this.options.filterEnvs?.includes(currentEnvWithoutVersion)
      ) {
        return component;
      }
      return undefined;
    });
    const filtered = compact(await Promise.all(filteredP));
    return filtered;
  }

  async _fetchDivergeData(components: Component[]) {
    if (this.options.objectsOnly) {
      // no need for it when importing objects only. if it's enabled, in case when on a lane and a non-lane
      // component is in bitmap using an older version, it throws "getDivergeData: unable to find Version X of Y"
      return;
    }
    await Promise.all(
      components.map(async (component) => {
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
        snapsLocal: modelComponent.getDivergeData().snapsOnSourceOnly.length,
        snapsRemote: modelComponent.getDivergeData().snapsOnTargetOnly.length,
      }));
      throw new ComponentsPendingMerge(divergeData);
    }
  }

  private async throwForComponentsFromAnotherLane(bitIds: ComponentID[]) {
    if (this.options.objectsOnly) return;
    const currentLaneId = this.workspace.getCurrentLaneId();
    const currentRemoteLane = this.remoteLane?.toLaneId().isEqual(currentLaneId) ? this.remoteLane : undefined;
    const currentLane = await this.workspace.getCurrentLaneObject();
    const idsFromAnotherLane: ComponentID[] = [];
    if (currentRemoteLane) {
      await Promise.all(
        bitIds.map(async (bitId) => {
          const isOnCurrentLane =
            (await this.scope.isPartOfLaneHistory(bitId, currentRemoteLane)) ||
            (currentLane && (await this.scope.isPartOfLaneHistory(bitId, currentLane))) ||
            (await this.scope.isPartOfMainHistory(bitId));
          if (!isOnCurrentLane) idsFromAnotherLane.push(bitId);
        })
      );
    } else {
      await Promise.all(
        bitIds.map(async (bitId) => {
          const isIdOnMain = await this.scope.isPartOfMainHistory(bitId);
          if (!isIdOnMain) idsFromAnotherLane.push(bitId);
        })
      );
    }
    if (idsFromAnotherLane.length) {
      throw new BitError(`unable to import the following component(s) as they belong to other lane(s):
${idsFromAnotherLane.map((id) => id.toString()).join(', ')}
if you need this specific snap, find the lane this snap is belong to, then run "bit lane merge <lane-id> [component-id]" to merge this component from the lane.
if you just want to get a quick look into this snap, create a new workspace and import it by running "bit lane import <lane-id> --pattern <component-id>"`);
    }
  }

  private async _importComponentsObjects(
    ids: ComponentIdList,
    {
      fromOriginalScope = false,
      lane,
      ignoreMissingHead = false,
    }: {
      fromOriginalScope?: boolean;
      lane?: Lane;
      ignoreMissingHead?: boolean;
    }
  ): Promise<VersionDependencies[]> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    await scopeComponentsImporter.importWithoutDeps(ids.toVersionLatest(), {
      cache: false,
      lane,
      includeVersionHistory: true,
      fetchHeadIfLocalIsBehind: !this.options.allHistory,
      collectParents: this.options.allHistory,
      // in case a user is merging a lane into a new workspace, then, locally main has head, but remotely the head is
      // empty, until it's exported. going to the remote and asking this component will throw an error if ignoreMissingHead is false
      ignoreMissingHead: true,
      includeUnexported: this.options.isLaneFromRemote,
      reason: `of their latest on ${lane ? `lane ${lane.id()}` : 'main'}`,
    });

    this.logger.setStatusLine(`import ${ids.length} components with their dependencies (if missing)`);
    const results = fromOriginalScope
      ? await scopeComponentsImporter.importManyFromOriginalScopes(ids)
      : await scopeComponentsImporter.importMany({
          ids,
          ignoreMissingHead,
          lane,
          preferDependencyGraph: !this.options.fetchDeps,
          // when user is running "bit import", we want to re-fetch if it wasn't built. todo: check if this can be disabled when not needed
          reFetchUnBuiltVersion: true,
          // it's possible that .bitmap is not in sync and has local tags that don't exist on the remote. later, we
          // add them to "missingIds" of "importResult" and show them to the user
          throwForSeederNotFound: false,
          reason: this.options.fetchDeps
            ? 'for getting all dependencies'
            : `for getting dependencies of components that don't have dependency-graph`,
        });

    return results;
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
  private async getBitIdsForLanes(): Promise<ComponentID[]> {
    if (!this.options.lanes) {
      throw new Error(`getBitIdsForLanes: this.options.lanes must be set`);
    }
    const remoteLaneIds = this.remoteLane?.toComponentIds() || new ComponentIdList();

    if (!this.options.ids.length) {
      const bitMapIds = this.consumer.bitMap.getAllBitIds();
      const bitMapIdsToImport = bitMapIds.filter((id) => id.hasScope() && !remoteLaneIds.has(id));
      remoteLaneIds.push(...bitMapIdsToImport);

      return remoteLaneIds;
    }

    const idsWithWildcard = this.options.ids.filter((id) => hasWildcard(id));
    const idsWithoutWildcard = this.options.ids.filter((id) => !hasWildcard(id));
    const idsWithoutWildcardPreferFromLane = await Promise.all(
      idsWithoutWildcard.map(async (idStr) => {
        const id = await this.getIdFromStr(idStr);
        const fromLane = remoteLaneIds.searchWithoutVersion(id);
        return fromLane && !id.hasVersion() ? fromLane : id;
      })
    );

    const bitIds: ComponentID[] = [...idsWithoutWildcardPreferFromLane];

    if (!idsWithWildcard) {
      return bitIds;
    }

    await pMapSeries(idsWithWildcard, async (idStr: string) => {
      const existingOnLanes = await this.workspace.filterIdsFromPoolIdsByPattern(idStr, remoteLaneIds, false);
      // in case the wildcard contains components from the lane, the user wants to import only them. not from main.
      // otherwise, if the wildcard translates to main components only, it's ok to import from main.
      if (existingOnLanes.length) {
        bitIds.push(...existingOnLanes);
      } else {
        const idsFromRemote = await this.lister.getRemoteCompIdsByWildcards(idStr, this.options.includeDeprecated);
        bitIds.push(...idsFromRemote);
      }
    });

    return bitIds;
  }

  private async getIdFromStr(id: string): Promise<ComponentID> {
    if (id.startsWith('@')) return this.workspace.resolveComponentIdFromPackageName(id);
    return ComponentID.fromString(id); // we don't support importing without a scope name
  }

  private async getBitIdsForNonLanes() {
    const bitIds: ComponentID[] = [];
    await Promise.all(
      this.options.ids.map(async (idStr: string) => {
        if (hasWildcard(idStr)) {
          let ids: ComponentID[] = [];
          try {
            ids = await this.lister.getRemoteCompIdsByWildcards(idStr, this.options.includeDeprecated);
          } catch (err: any) {
            if (err instanceof NoIdMatchWildcard) {
              this.logger.consoleWarning(err.message);
            } else {
              throw err;
            }
          }
          bitIds.push(...ids);
        } else {
          const id = await this.getIdFromStr(idStr);
          bitIds.push(id);
        }
      })
    );

    this.logger.setStatusLine(BEFORE_IMPORT_ACTION); // it stops the previous loader of BEFORE_REMOTE_LIST

    return bitIds;
  }

  private async getBitIds(): Promise<ComponentIdList> {
    const bitIds: ComponentID[] = this.options.lanes
      ? await this.getBitIdsForLanes()
      : await this.getBitIdsForNonLanes();
    const shouldImportDependents =
      this.options.importDependents || this.options.dependentsVia || this.options.dependentsAll;
    const shouldImportDependencies =
      this.options.importDependenciesDirectly || this.options.importHeadDependenciesDirectly;
    if (shouldImportDependencies || shouldImportDependents) {
      if (shouldImportDependencies) {
        const dependenciesIds = await this.getFlattenedDepsUnique(bitIds);
        bitIds.push(...dependenciesIds);
      }
      if (shouldImportDependents) {
        const dependentsGetter = new DependentsGetter(this.logger, this.workspace, this.graph, this.options);
        const dependents = await dependentsGetter.getDependents(bitIds);
        bitIds.push(...dependents);
      }
    }
    return ComponentIdList.uniqFromArray(bitIds);
  }

  private async getFlattenedDepsUnique(bitIds: ComponentID[]): Promise<ComponentID[]> {
    const remoteComps = await this.scope.scopeImporter.getManyRemoteComponents(bitIds);
    const versions = remoteComps.getVersions();
    const getFlattened = (): ComponentIdList => {
      if (versions.length === 1) return versions[0].flattenedDependencies;
      const flattenedDeps = versions.map((v) => v.flattenedDependencies).flat();
      return ComponentIdList.uniqFromArray(flattenedDeps);
    };
    const flattened = getFlattened();
    return this.options.importHeadDependenciesDirectly
      ? this.uniqWithoutVersions(flattened)
      : this.removeMultipleVersionsKeepLatest(flattened);
  }

  private uniqWithoutVersions(flattened: ComponentIdList) {
    const latest = flattened.toVersionLatest();
    return ComponentIdList.uniqFromArray(latest);
  }

  private removeMultipleVersionsKeepLatest(flattened: ComponentIdList): ComponentID[] {
    const grouped = flattened.toGroupByIdWithoutVersion();
    const latestVersions = Object.keys(grouped).map((key) => {
      const ids = grouped[key];
      if (ids.length === 1) return ids[0];
      try {
        const latest = getLatestVersionNumber(ids, ids[0].changeVersion(LATEST_VERSION));
        return latest;
      } catch (err: any) {
        throw new Error(`a dependency "${key}" was found with multiple versions, unable to find which one of them is newer.
error: ${err.message}
consider running with "--dependencies-head" flag instead, which checks out to the head of the dependencies`);
      }
    });

    return latestVersions;
  }

  async importAccordingToBitMap(): Promise<ImportResult> {
    this.options.objectsOnly = !this.options.merge && !this.options.override;
    const componentsIdsToImport = this.getIdsToImportFromBitmap();
    const emptyResult = {
      importedIds: [],
      importedDeps: [],
      importDetails: [],
    };
    if (!componentsIdsToImport.length) {
      return emptyResult;
    }
    await this._throwForModifiedOrNewComponents(componentsIdsToImport);
    const beforeImportVersions = await this._getCurrentVersions(componentsIdsToImport);
    if (!componentsIdsToImport.length) {
      return emptyResult;
    }
    if (!this.options.objectsOnly) {
      const flagUsed = this.options.merge ? '--merge' : '--override';
      throw new Error(`bit import with no ids and ${flagUsed} flag is not supported.
to write the components from .bitmap file according to the their remote, please use "bit checkout reset --all"`);
    }
    const versionDependenciesArr = await this._importComponentsObjects(componentsIdsToImport, {
      fromOriginalScope: this.options.fromOriginalScope,
    });
    let writtenComponents: Component[] = [];
    let componentWriterResults: ComponentWriterResults | undefined;
    if (!this.options.objectsOnly) {
      const components = await multipleVersionDependenciesToConsumer(versionDependenciesArr, this.scope.objects);
      componentWriterResults = await this._writeToFileSystem(components);
      writtenComponents = components;
    }

    return this.returnCompleteResults(
      beforeImportVersions,
      versionDependenciesArr,
      writtenComponents,
      componentWriterResults
    );
  }

  private getIdsToImportFromBitmap() {
    const allIds = this.consumer.bitMap.getAllBitIdsFromAllLanes();
    return ComponentIdList.fromArray(allIds.filter((id) => id.hasScope()));
  }

  async _getCurrentVersions(ids: ComponentIdList): Promise<ImportedVersions> {
    const versionsP = ids.map(async (id) => {
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id.changeVersion(undefined));
      const idStr = id.toStringWithoutVersion();
      if (!modelComponent) return [idStr, []];
      return [idStr, modelComponent.listVersions()];
    });
    const versions = await Promise.all(versionsP);
    return fromPairs(versions);
  }

  /**
   * get import details, includes the diff between the versions array before import and after import
   */
  async _getImportDetails(
    currentVersions: ImportedVersions,
    components: VersionDependencies[]
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
      if (!modelComponent) throw new BitError(`imported component ${idStr} was not found in the model`);
      const afterImportVersions = modelComponent.listVersions();
      const versionDifference: string[] = difference(afterImportVersions, beforeImportVersions);
      const getStatus = (): ImportStatus => {
        if (!versionDifference.length) return 'up to date';
        if (!beforeImportVersions.length) return 'added';
        return 'updated';
      };
      const filesStatus = this.mergeStatus && this.mergeStatus[idStr] ? this.mergeStatus[idStr] : null;
      const deprecated = Boolean(await modelComponent.isDeprecated(this.scope.objects, id.version));
      const removed = Boolean(await component.component.component.isRemoved(this.scope.objects, id.version));
      const latestVersion = modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true);
      return {
        id: idStr,
        versions: versionDifference,
        latestVersion: versionDifference.includes(latestVersion) ? latestVersion : null,
        status: getStatus(),
        filesStatus,
        missingDeps: this.options.fetchDeps ? component.getMissingDependencies() : [],
        deprecated,
        removed,
      };
    });
    const importDetails: ImportDetails[] = await Promise.all(detailsP);

    return importDetails;
  }

  async _throwForPotentialIssues(ids: ComponentIdList): Promise<void> {
    await this._throwForModifiedOrNewComponents(ids);
    this._throwForDifferentComponentWithSameName(ids);
  }

  async _throwForModifiedOrNewComponents(ids: ComponentIdList): Promise<void> {
    // the typical objectsOnly option is when a user cloned a project with components tagged to the source code, but
    // doesn't have the model objects. in that case, calling getComponentStatusById() may return an error as it relies
    // on the model objects when there are dependencies
    if (this.options.override || this.options.objectsOnly || this.options.merge || this.options.trackOnly) return;
    const componentsStatuses = await this.workspace.getManyComponentsStatuses(ids);
    const modifiedComponents = componentsStatuses
      .filter(({ status }) => status.modified || status.newlyCreated)
      .map((c) => c.id);
    if (modifiedComponents.length) {
      throw new BitError(
        `unable to import the following components due to local changes, use --merge flag to merge your local changes or --override to override them\n${modifiedComponents.join(
          '\n'
        )} `
      );
    }
  }

  /**
   * Model Component id() calculation uses id.toString() for the hash.
   * If an imported component has scopereadonly name equals to a local name, both will have the exact same
   * hash and they'll override each other.
   */
  _throwForDifferentComponentWithSameName(ids: ComponentIdList): void {
    ids.forEach((id: ComponentID) => {
      const existingId = this.consumer.getParsedIdIfExist(id.toStringWithoutVersion());
      if (existingId && !existingId.hasScope()) {
        throw new BitError(`unable to import ${id.toString()}. the component name conflicted with your local (new/staged) component with the same name.
it's fine to have components with the same name as long as their scope names are different.
if the component was created by mistake, remove it and import the remote one.
otherwise, if tagged/snapped, "bit reset" it, then bit rename it.`);
      }
    });
  }

  async _getMergeStatus(component: Component): Promise<ComponentMergeStatus> {
    const componentStatus = await this.workspace.getComponentStatusById(component.id);
    const mergeStatus: ComponentMergeStatus = { component, mergeResults: null };
    if (!componentStatus.modified) return mergeStatus;
    const componentModel = await this.consumer.scope.getModelComponent(component.id);
    const existingBitMapBitId = this.consumer.bitMap.getComponentId(component.id, { ignoreVersion: true });
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
      scope: this.consumer.scope,
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
    const component = componentMergeStatus.component;
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
  async updateAllComponentsAccordingToMergeStrategy(components: Component[]): Promise<Component[]> {
    if (!this.options.merge) return components;
    const componentsStatusP = components.map((component: Component) => {
      return this._getMergeStatus(component);
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
      const component = componentStatus.component;
      if (!filesStatus) return component;
      this.mergeStatus[component.id.toStringWithoutVersion()] = filesStatus;
      const unchangedFiles = Object.keys(filesStatus).filter((file) => filesStatus[file] === FileStatus.unchanged);
      if (unchangedFiles.length === Object.keys(filesStatus).length) {
        // all files are unchanged
        return null;
      }
      return component;
    });
    return compact(componentsToWrite);
  }

  _shouldSaveLaneData(): boolean {
    if (this.options.objectsOnly) {
      return false;
    }
    return this.consumer.isOnLane();
  }

  async _saveLaneDataIfNeeded(components: Component[]): Promise<void> {
    if (!this._shouldSaveLaneData()) {
      return;
    }
    const currentLane = await this.consumer.getCurrentLaneObject();
    if (!currentLane) {
      return; // user on main
    }
    const idsFromRemoteLanes = this.remoteLane?.toComponentIds() || new ComponentIdList();
    await Promise.all(
      components.map(async (comp) => {
        const existOnRemoteLane = idsFromRemoteLanes.has(comp.id);
        if (!existOnRemoteLane && !this.options.saveInLane) {
          this.consumer.bitMap.setOnLanesOnly(comp.id, false);
          return;
        }
        const modelComponent = await this.scope.getModelComponent(comp.id);
        const ref = modelComponent.getRef(comp.id.version as string);
        if (!ref) throw new Error(`_saveLaneDataIfNeeded unable to get ref for ${comp.id.toString()}`);
        currentLane.addComponent({ id: comp.id, head: ref });
      })
    );
    await this.scope.lanes.saveLane(currentLane, { laneHistoryMsg: 'import components' });
  }

  async _writeToFileSystem(components: Component[]): Promise<ComponentWriterResults> {
    const componentsToWrite = await this.updateAllComponentsAccordingToMergeStrategy(components);
    const manyComponentsWriterOpts: ManyComponentsWriterParams = {
      components: componentsToWrite,
      writeToPath: this.options.writeToPath,
      writeConfig: this.options.writeConfig,
      skipDependencyInstallation: !this.options.installNpmPackages,
      skipWriteConfigFiles: !this.options.writeConfigFiles,
      verbose: this.options.verbose,
      throwForExistingDir: !this.options.override,
      skipWritingToFs: this.options.trackOnly,
      shouldUpdateWorkspaceConfig: true,
      reasonForBitmapChange: 'import',
    };
    return this.componentWriter.writeMany(manyComponentsWriterOpts);
  }
}
