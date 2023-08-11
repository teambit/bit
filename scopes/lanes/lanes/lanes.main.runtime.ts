import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import pMapSeries from 'p-map-series';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { OutsideWorkspaceError, Workspace, WorkspaceAspect } from '@teambit/workspace';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { LaneDiffCmd, LaneDiffGenerator, LaneDiffResults } from '@teambit/lanes.modules.diff';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { LaneId, DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { DiffOptions } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { MergeStrategy, MergeOptions } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { TrackLane } from '@teambit/legacy/dist/scope/scope-json';
import { ImporterAspect, ImporterMain } from '@teambit/importer';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import removeLanes from '@teambit/legacy/dist/consumer/lanes/remove-lanes';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import { Scope as LegacyScope } from '@teambit/legacy/dist/scope';
import { BitId, InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import { ExportAspect, ExportMain } from '@teambit/export';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { compact, partition } from 'lodash';
import { ComponentCompareMain, ComponentCompareAspect } from '@teambit/component-compare';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import ComponentWriterAspect, { ComponentWriterMain } from '@teambit/component-writer';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import RemoveAspect, { RemoveMain } from '@teambit/remove';
import { MergingMain, MergingAspect } from '@teambit/merging';
import CheckoutAspect, { CheckoutMain } from '@teambit/checkout';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import { ComponentNotFound } from '@teambit/legacy/dist/scope/exceptions';
import ComponentsList, { DivergeDataPerId } from '@teambit/legacy/dist/consumer/component/components-list';
import { NoCommonSnap } from '@teambit/legacy/dist/scope/exceptions/no-common-snap';
import { LanesAspect } from './lanes.aspect';
import {
  LaneCmd,
  LaneCreateCmd,
  LaneImportCmd,
  LaneListCmd,
  LaneRemoveCmd,
  LaneShowCmd,
  LaneChangeScopeCmd,
  LaneAliasCmd,
  LaneRenameCmd,
  LaneAddReadmeCmd,
  LaneRemoveReadmeCmd,
  LaneRemoveCompCmd,
  RemoveCompsOpts,
} from './lane.cmd';
import { lanesSchema } from './lanes.graphql';
import { SwitchCmd } from './switch.cmd';
import { LaneSwitcher } from './switch-lanes';
import { createLane, createLaneInScope, throwForInvalidLaneName } from './create-lane';
import { LanesCreateRoute } from './lanes.create.route';
import { LanesDeleteRoute } from './lanes.delete.route';
import { LanesRestoreRoute } from './lanes.restore.route';

export { Lane };

export type SnapsDistanceObj = {
  onSource: string[];
  onTarget: string[];
  common?: string;
};

export type LaneResults = {
  lanes: LaneData[];
  currentLane?: string | null;
};

export type CreateLaneOptions = {
  scope?: string; // default to the defaultScope in workspace.jsonc
  alias?: string; // default to the remote name
  forkLaneNewScope?: boolean;
};

export type SwitchLaneOptions = {
  alias?: string;
  merge?: MergeStrategy;
  getAll?: boolean;
  pattern?: string;
  skipDependencyInstallation?: boolean;
  verbose?: boolean;
  override?: boolean;
};

export type LaneComponentDiffStatus = {
  componentId: ComponentID;
  sourceHead: string;
  targetHead?: string;
  /**
   * @deprecated
   * use changes to get list of all the changes
   */
  changeType?: ChangeType;
  changes?: ChangeType[];
  upToDate?: boolean;
  snapsDistance?: SnapsDistanceObj;
  unrelated?: boolean;
};

export type LaneDiffStatusOptions = {
  skipChanges?: boolean;
};

export type LaneDiffStatus = {
  source: LaneId;
  target: LaneId;
  componentsStatus: LaneComponentDiffStatus[];
};

export type MarkRemoveOnLaneResult = { removedFromWs: ComponentID[]; markedRemoved: ComponentID[] };

type CreateLaneResult = {
  laneId: LaneId;
  hash: string;
  alias?: string;
};

export class LanesMain {
  constructor(
    private workspace: Workspace | undefined,
    private scope: ScopeMain,
    private merging: MergingMain,
    private componentAspect: ComponentMain,
    public logger: Logger,
    readonly importer: ImporterMain,
    private exporter: ExportMain,
    private componentCompare: ComponentCompareMain,
    readonly componentWriter: ComponentWriterMain,
    private remove: RemoveMain,
    readonly checkout: CheckoutMain
  ) {}

  async getLanes({
    name,
    remote,
    merged,
    showDefaultLane,
    notMerged,
  }: {
    name?: string;
    remote?: string;
    merged?: boolean;
    showDefaultLane?: boolean;
    notMerged?: boolean;
  }): Promise<LaneData[]> {
    const showMergeData = Boolean(merged || notMerged);
    const consumer = this.workspace?.consumer;

    if (remote) {
      const laneId = name ? LaneId.from(name, remote) : undefined;
      const remoteObj = await getRemoteByName(remote, consumer);
      const lanes = await remoteObj.listLanes(laneId?.toString(), showMergeData);
      // no need to filter soft-removed here. it was filtered already in the remote
      return lanes;
    }

    if (name === DEFAULT_LANE) {
      const defaultLane = await this.getLaneDataOfDefaultLane();
      return defaultLane ? [defaultLane] : [];
    }

    const lanes = await this.scope.legacyScope.lanes.getLanesData(this.scope.legacyScope, name, showMergeData);

    if (showDefaultLane) {
      const defaultLane = await this.getLaneDataOfDefaultLane();
      if (defaultLane) lanes.push(defaultLane);
    }

    return this.filterSoftRemovedLaneComps(lanes);
  }

  async parseLaneId(idStr: string): Promise<LaneId> {
    const scope: LegacyScope = this.scope.legacyScope;
    return scope.lanes.parseLaneIdFromString(idStr);
  }

  private async filterSoftRemovedLaneComps(lanes: LaneData[]): Promise<LaneData[]> {
    return Promise.all(
      lanes.map(async (lane) => {
        if (lane.id.isDefault()) return lane;

        const componentIds = compact(
          await Promise.all(
            (
              await this.getLaneComponentIds(lane)
            ).map(async (laneCompId) => {
              try {
                if (await this.scope.isComponentRemoved(laneCompId)) return undefined;
              } catch (err) {
                // if (err instanceof ComponentNotFound)
                // throw new Error(
                //   `component "${laneCompId.toString()}" from the lane "${lane.id.toString()}" not found`
                // );
                // throw err;
                if (err instanceof ComponentNotFound)
                  this.logger.warn(
                    `component "${laneCompId.toString()}" from the lane "${lane.id.toString()}" not found`
                  );

                return undefined;
              }
              return { id: laneCompId._legacy, head: laneCompId.version as string };
            })
          )
        );

        const laneData: LaneData = {
          ...lane,
          components: componentIds,
        };
        return laneData;
      })
    );
  }

  getCurrentLaneName(): string | null {
    return this.getCurrentLaneId()?.name || null;
  }

  getCurrentLaneNameOrAlias(): string | null {
    const currentLaneId = this.getCurrentLaneId();
    if (!currentLaneId) return null;
    const trackingData = this.scope.legacyScope.lanes.getLocalTrackedLaneByRemoteName(
      currentLaneId.name,
      currentLaneId.scope
    );
    return trackingData || currentLaneId.name;
  }

  getCurrentLaneId(): LaneId | null {
    if (!this.workspace) return null;
    return this.workspace.consumer.getCurrentLaneId();
  }

  /**
   * get the currently checked out lane object, if on main - return null.
   */
  async getCurrentLane(): Promise<Lane | null> {
    const laneId = this.getCurrentLaneId();
    if (!laneId || laneId.isDefault()) return null;
    return this.loadLane(laneId);
  }

  getDefaultLaneId(): LaneId {
    return LaneId.from(DEFAULT_LANE, this.scope.name);
  }

  setCurrentLane(laneId: LaneId, alias?: string, exported?: boolean) {
    this.workspace?.consumer.setCurrentLane(laneId, exported);
  }

  async createLane(
    name: string,
    { scope, alias, forkLaneNewScope }: CreateLaneOptions = {}
  ): Promise<CreateLaneResult> {
    if (!this.workspace) {
      const newLane = await createLaneInScope(name, this.scope);
      return {
        laneId: newLane.toLaneId(),
        hash: newLane.hash().toString(),
      };
    }
    if (alias) {
      throwForInvalidLaneName(alias);
    }
    const currentLaneId = this.workspace.getCurrentLaneId();
    const currentLaneScope = currentLaneId.isDefault() ? undefined : currentLaneId.scope;
    if (!forkLaneNewScope && !currentLaneId.isDefault() && scope && currentLaneScope !== scope) {
      throw new BitError(`you're about to create a lane forked from ${currentLaneId.toString()} and assign it to a different scope "${scope}".
if the lane components have a large history, it would be best to stick with the same scope as the current lane.
to do that, re-run the command without the "--scope" flag. it will create the lane and set the scope to "${currentLaneScope}"
if you wish to keep ${scope} scope, please re-run the command with "--fork-lane-new-scope" flag.`);
    }
    scope = scope || (currentLaneId.isDefault() ? this.workspace.defaultScope : currentLaneId.scope);
    const laneObj = await createLane(this.workspace, name, scope);
    const laneId = LaneId.from(name, scope);
    this.setCurrentLane(laneId, alias, false);
    const trackLaneData = {
      localLane: alias || name,
      remoteLane: name,
      remoteScope: scope,
    };
    this.scope.legacyScope.lanes.trackLane(trackLaneData);
    this.scope.legacyScope.scopeJson.setLaneAsNew(name);
    await this.workspace.consumer.onDestroy();

    const results = {
      alias,
      laneId: laneObj.toLaneId(),
      hash: laneObj.hash().toString(),
    };
    return results;
  }

  async loadLane(id: LaneId): Promise<Lane | null> {
    return this.scope.legacyScope.lanes.loadLane(id);
  }

  async trackLane(
    localName: string,
    remoteScope: string,
    remoteName?: string
  ): Promise<{ beforeTrackData?: TrackLane; afterTrackData: TrackLane }> {
    if (!this.workspace) {
      throw new BitError(`unable to track a lane outside of Bit workspace`);
    }
    const laneId = await this.scope.legacyScope.lanes.parseLaneIdFromString(localName);
    const lane = await this.loadLane(laneId);
    if (!lane) {
      throw new BitError(`unable to find a local lane "${localName}"`);
    }
    const beforeTrackData = this.scope.legacyScope.lanes.getRemoteTrackedDataByLocalLane(localName);
    const beforeTrackDataCloned = beforeTrackData ? { ...beforeTrackData } : undefined;
    const afterTrackData = {
      localLane: localName,
      remoteLane: remoteName || beforeTrackData?.remoteLane || localName,
      remoteScope,
    };
    this.scope.legacyScope.lanes.trackLane(afterTrackData);
    await this.workspace.consumer.onDestroy();

    return { beforeTrackData: beforeTrackDataCloned, afterTrackData };
  }

  async aliasLane(laneName: string, alias: string): Promise<{ laneId: LaneId }> {
    if (!this.workspace) {
      throw new BitError(`unable to alias a lane outside of Bit workspace`);
    }
    if (alias.includes(LANE_REMOTE_DELIMITER)) {
      throw new BitError(`an alias cannot include a delimiter "${LANE_REMOTE_DELIMITER}"`);
    }
    if (alias === laneName) {
      throw new BitError(`an alias cannot be the same as the lane name`);
    }
    const laneId = await this.scope.legacyScope.lanes.parseLaneIdFromString(laneName);
    const lane = await this.loadLane(laneId);
    if (!lane) {
      throw new BitError(`unable to find a local lane "${laneName}"`);
    }
    const trackData = {
      localLane: alias,
      remoteLane: laneId.name,
      remoteScope: laneId.scope,
    };
    const laneNameWithoutScope = laneName.includes(LANE_REMOTE_DELIMITER)
      ? laneName.split(LANE_REMOTE_DELIMITER)[1]
      : laneName;
    this.scope.legacyScope.lanes.removeTrackLane(laneNameWithoutScope);
    this.scope.legacyScope.lanes.trackLane(trackData);
    await this.workspace.consumer.onDestroy();

    return { laneId };
  }

  async changeScope(laneName: string, remoteScope: string): Promise<{ remoteScopeBefore: string }> {
    if (!this.workspace) {
      throw new BitError(`unable to change-scope of a lane outside of Bit workspace`);
    }
    const laneNameWithoutScope = laneName.includes(LANE_REMOTE_DELIMITER)
      ? laneName.split(LANE_REMOTE_DELIMITER)[1]
      : laneName;
    const laneId = await this.scope.legacyScope.lanes.parseLaneIdFromString(laneName);
    const lane = await this.loadLane(laneId);
    if (!lane) {
      throw new BitError(`unable to find a local lane "${laneName}"`);
    }
    if (!lane.isNew) {
      throw new BitError(`changing lane scope-name is allowed for new lanes only. this lane has been exported already.
please create a new lane instead, which will include all components of this lane`);
    }
    if (!isValidScopeName(remoteScope)) {
      throw new InvalidScopeName(remoteScope);
    }
    const remoteScopeBefore = lane.scope;
    lane.scope = remoteScope;
    const newLaneId = LaneId.from(laneId.name, remoteScope);
    const trackData = {
      localLane: laneNameWithoutScope,
      remoteLane: laneId.name,
      remoteScope,
    };
    this.scope.legacyScope.lanes.trackLane(trackData);
    await this.scope.legacyScope.lanes.saveLane(lane);
    this.workspace.consumer.bitMap.setCurrentLane(newLaneId, false);
    await this.workspace.consumer.onDestroy();

    return { remoteScopeBefore };
  }

  /**
   * change a lane-name and if possible, export the lane to the remote
   */
  async rename(currentName: string, newName: string): Promise<{ exported: boolean; exportErr?: Error }> {
    if (!this.workspace) {
      throw new BitError(`unable to rename a lane outside of Bit workspace`);
    }
    throwForInvalidLaneName(newName);
    const existingAliasWithNewName = this.scope.legacyScope.lanes.getRemoteTrackedDataByLocalLane(newName);
    if (existingAliasWithNewName) {
      const remoteIdStr = `${existingAliasWithNewName.remoteLane}/${existingAliasWithNewName.remoteScope}`;
      throw new BitError(`unable to rename to ${newName}. this name is already used to track: ${remoteIdStr}`);
    }
    const laneNameWithoutScope = currentName.includes(LANE_REMOTE_DELIMITER)
      ? currentName.split(LANE_REMOTE_DELIMITER)[1]
      : currentName;
    const laneId = await this.scope.legacyScope.lanes.parseLaneIdFromString(currentName);
    const lane = await this.loadLane(laneId);
    if (!lane) {
      throw new BitError(`unable to find a local lane "${currentName}"`);
    }

    // rename the ref file
    await this.scope.legacyScope.objects.remoteLanes.renameRefByNewLaneName(laneNameWithoutScope, newName, lane.scope);

    // change tracking data
    const afterTrackData = {
      localLane: newName,
      remoteLane: newName,
      remoteScope: lane.scope,
    };
    this.scope.legacyScope.lanes.trackLane(afterTrackData);
    this.scope.legacyScope.lanes.removeTrackLane(laneNameWithoutScope);

    // change the lane object
    lane.name = newName;
    await this.scope.legacyScope.lanes.saveLane(lane);

    // change current-lane if needed
    const currentLaneId = this.getCurrentLaneId();
    if (currentLaneId?.isEqual(laneId)) {
      const newLaneId = LaneId.from(newName, lane.scope);
      const isExported = this.workspace.consumer.bitMap.isLaneExported;
      this.setCurrentLane(newLaneId, undefined, isExported);
    }

    // export the lane with only the name-change
    const clonedLaneToExport = lane.clone();
    clonedLaneToExport.components = []; // otherwise, it'll export the changes done on the components.
    let exported = false;
    let exportErr: Error | undefined;
    try {
      await this.exportLane(clonedLaneToExport);
      exported = true;
    } catch (err: any) {
      this.logger.error(`unable to export ${lane.id.toString()}: ${err.message}`);
      exportErr = err;
    }

    await this.workspace.consumer.onDestroy();

    return { exported, exportErr };
  }

  async exportLane(lane: Lane) {
    await this.exporter.exportMany({
      scope: this.scope.legacyScope,
      laneObject: lane,
      ids: new BitIds(),
      idsWithFutureScope: new BitIds(),
      allVersions: false,
    });
  }

  async importLaneObject(laneId: LaneId, persistIfNotExists = true): Promise<Lane> {
    return this.importer.importLaneObject(laneId, persistIfNotExists);
  }

  /**
   * get the distance for a component between two lanes. for example, lane-b forked from lane-a and lane-b added some new snaps
   * @param componentId
   * @param sourceHead head on the source lane. leave empty if the source is main
   * @param targetHead head on the target lane. leave empty if the target is main
   * @returns
   */
  async getSnapsDistance(
    componentId: ComponentID,
    sourceHead?: string,
    targetHead?: string,
    throws?: boolean
  ): Promise<SnapsDistance> {
    if (!sourceHead && !targetHead)
      throw new Error(`getDivergeData got sourceHead and targetHead empty. at least one of them should be populated`);
    const modelComponent = await this.scope.legacyScope.getModelComponent(componentId._legacy);
    return getDivergeData({
      modelComponent,
      repo: this.scope.legacyScope.objects,
      sourceHead: sourceHead ? Ref.from(sourceHead) : modelComponent.head || null,
      targetHead: targetHead ? Ref.from(targetHead) : modelComponent.head || null,
      throws,
    });
  }

  /**
   * get the head hash (snap) of main. return undefined if the component exists only on a lane and was never merged to main
   */
  async getHeadOnMain(componentId: ComponentID): Promise<string | undefined> {
    const modelComponent = await this.scope.legacyScope.getModelComponent(componentId._legacy);
    return modelComponent.head?.toString();
  }

  /**
   * fetch the lane object and its components from the remote.
   * save the objects and the lane to the local scope.
   * this method doesn't change anything in the workspace.
   */
  async fetchLaneWithItsComponents(laneId: LaneId): Promise<Lane> {
    this.logger.debug(`fetching lane ${laneId.toString()}`);
    if (!this.workspace) {
      throw new BitError('unable to fetch lanes outside of Bit workspace');
    }
    const lane = await this.importer.importLaneObject(laneId);
    if (!lane) throw new Error(`unable to import lane ${laneId.toString()} from the remote`);

    await this.importer.fetchLaneComponents(lane);
    this.logger.debug(`fetching lane ${laneId.toString()} done, fetched ${lane.components.length} components`);
    return lane;
  }

  async removeLanes(laneNames: string[], opts?: { remote: boolean; force: boolean }): Promise<string[]> {
    if (!this.workspace && !opts?.remote) {
      await this.scope.legacyScope.lanes.removeLanes(this.scope.legacyScope, laneNames, true);
      return laneNames;
    }
    const results = await removeLanes(this.workspace?.consumer, laneNames, !!opts?.remote, !!opts?.force);
    if (this.workspace) await this.workspace.consumer.onDestroy();

    return results.laneResults;
  }

  /**
   * when deleting a lane object, it is sent into the "trash" directory in the scope.
   * this method restores it and put it back in the "objects" directory.
   * as an argument, it needs a hash. the reason for not supporting lane-id is because the trash may have multiple
   * lanes with the same lane-id but different hashes.
   */
  async restoreLane(laneHash: string) {
    const ref = Ref.from(laneHash);
    const objectsFromTrash = (await this.scope.legacyScope.objects.getFromTrash([ref])) as Lane[];
    const laneIdFromTrash = objectsFromTrash[0].toLaneId();
    const existingWithSameId = await this.loadLane(laneIdFromTrash);
    if (existingWithSameId) {
      if (existingWithSameId.hash().isEqual(ref)) {
        throw new BitError(`unable to restore lane ${laneIdFromTrash.toString()}, as it already exists`);
      }
      throw new BitError(
        `unable to restore lane ${laneIdFromTrash.toString()}, as a lane with the same id already exists`
      );
    }
    await this.scope.legacyScope.objects.restoreFromTrash([ref]);
  }

  async removeComps(componentsPattern: string, removeCompsOpts: RemoveCompsOpts): Promise<MarkRemoveOnLaneResult> {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const currentLane = await workspace.getCurrentLaneObject();
    if (!currentLane) {
      throw new Error('markRemoveOnLane expects to get called when on a lane');
    }
    const { workspaceOnly, updateMain } = removeCompsOpts;
    if (!updateMain && (currentLane.isNew || workspaceOnly)) {
      const results = await this.remove.remove({
        componentsPattern,
        force: true,
      });
      const ids = results.localResult.removedComponentIds;
      const compIds = await workspace.resolveMultipleComponentIds(ids);
      return { removedFromWs: compIds, markedRemoved: [] };
    }

    const componentIds = await workspace.idsByPattern(componentsPattern);
    const laneBitIds = currentLane.toBitIds();
    const [idsToMarkRemove, idsToRemoveFromWs] = updateMain
      ? partition(componentIds, (id) => id.hasVersion())
      : partition(componentIds, (id) => laneBitIds.hasWithoutVersion(id._legacy));

    const removeFromWorkspace = async () => {
      if (!idsToRemoveFromWs.length) return [];
      const results = await this.remove.removeLocallyByIds(
        idsToRemoveFromWs.map((id) => id._legacy),
        { force: true }
      );
      const ids = results.localResult.removedComponentIds;
      return workspace.resolveMultipleComponentIds(ids);
    };

    const removedFromWs = await removeFromWorkspace();
    const markedRemoved = await this.remove.markRemoveComps(idsToMarkRemove, updateMain);

    return { removedFromWs, markedRemoved };
  }

  /**
   * switch to a different local or remote lane.
   * switching to a remote lane also imports and writes the components of that remote lane.
   * by default, only the components existing on the workspace will be imported from that lane, unless the "getAll"
   * flag is true.
   */
  async switchLanes(
    laneName: string,
    { alias, merge, pattern, getAll = false, skipDependencyInstallation = false }: SwitchLaneOptions
  ) {
    if (!this.workspace) {
      throw new BitError(`unable to switch lanes outside of Bit workspace`);
    }
    let mergeStrategy;
    if (merge && typeof merge === 'string') {
      const mergeOptions = Object.keys(MergeOptions);
      if (!mergeOptions.includes(merge)) {
        throw new BitError(`merge must be one of the following: ${mergeOptions.join(', ')}`);
      }
      mergeStrategy = merge;
    }
    if (alias) {
      throwForInvalidLaneName(alias);
    }

    const switchProps = {
      laneName,
      existingOnWorkspaceOnly: !getAll,
      pattern,
      alias,
    };
    const checkoutProps = {
      mergeStrategy,
      skipNpmInstall: skipDependencyInstallation,
      verbose: false, // not relevant in Harmony
      ignorePackageJson: true, // not relevant in Harmony
      ignoreDist: true, // not relevant in Harmony
      isLane: true,
      promptMergeOptions: false,
      writeConfig: false,
      reset: false,
      all: false,
    };
    return new LaneSwitcher(this.workspace, this.logger, switchProps, checkoutProps, this).switch();
  }

  /**
   * the values array may include zero to two values and will be processed as following:
   * [] => diff between the current lane and default lane. (only inside workspace).
   * [to] => diff between the current lane (or default-lane when in scope) and "to" lane.
   * [from, to] => diff between "from" lane and "to" lane.
   */
  public async getDiff(values: string[], diffOptions: DiffOptions = {}, pattern?: string): Promise<LaneDiffResults> {
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope);
    return laneDiffGenerator.generate(values, diffOptions, pattern);
  }

  async getLaneComponentModels(lane: LaneData): Promise<Component[]> {
    const host = this.componentAspect.getHost();
    const laneComponentIds = await this.getLaneComponentIds(lane);
    const components = await host.getMany(laneComponentIds);
    return components;
  }

  async getLaneComponentIds(lane: LaneData): Promise<ComponentID[]> {
    if (!lane) return [];

    const laneComponents = lane.components;
    const workspace = this.workspace;
    const bitIdsFromBitmap = workspace ? workspace.consumer.bitMap.getAllBitIdsFromAllLanes() : [];

    const filteredComponentIds = workspace
      ? laneComponents.filter((laneComponent) =>
          bitIdsFromBitmap.some((bitmapComponentId) => bitmapComponentId.isEqualWithoutVersion(laneComponent.id))
        )
      : laneComponents;

    const host = this.componentAspect.getHost();

    return Promise.all(
      filteredComponentIds.map((laneComponent) => {
        const legacyIdWithVersion = laneComponent.id.changeVersion(laneComponent.head);
        return host.resolveComponentId(legacyIdWithVersion);
      })
    );
  }

  async getLaneReadmeComponent(lane: LaneData): Promise<Component | undefined> {
    if (!lane) return undefined;
    const laneReadmeComponent = lane.readmeComponent;
    if (!laneReadmeComponent) return undefined;
    const host = this.componentAspect.getHost();
    const laneReadmeComponentId = await host.resolveComponentId(
      laneReadmeComponent.id.changeVersion(laneReadmeComponent.head)
    );
    const readmeComponent = await host.get(laneReadmeComponentId);
    return readmeComponent;
  }

  async removeLaneReadme(laneName?: string): Promise<{ result: boolean; message?: string }> {
    if (!this.workspace) {
      throw new BitError('unable to remove the lane readme component outside of Bit workspace');
    }
    const currentLaneName = this.getCurrentLaneName();

    if (!laneName && !currentLaneName) {
      return {
        result: false,
        message: 'unable to remove the lane readme component. Either pass a laneName or switch to a lane',
      };
    }

    const scope: LegacyScope = this.workspace.scope.legacyScope;
    const laneId: LaneId = laneName
      ? await scope.lanes.parseLaneIdFromString(laneName)
      : (this.getCurrentLaneId() as LaneId);
    const lane: Lane | null | undefined = await scope.loadLane(laneId);

    if (!lane?.readmeComponent) {
      throw new BitError(`there is no readme component added to the lane ${laneName || currentLaneName}`);
    }

    const readmeComponentId = await this.workspace.resolveComponentId(lane.readmeComponent.id);
    const existingLaneConfig =
      (await this.workspace.getSpecificComponentConfig(readmeComponentId, LanesAspect.id)) || {};

    const remoteLaneIdStr = lane.toLaneId().toString();

    if (existingLaneConfig.readme) {
      delete existingLaneConfig.readme[remoteLaneIdStr];
      await this.workspace.removeSpecificComponentConfig(readmeComponentId, LanesAspect.id, false);
      await this.workspace.addSpecificComponentConfig(readmeComponentId, LanesAspect.id, existingLaneConfig);
    }

    lane.setReadmeComponent(undefined);
    await scope.lanes.saveLane(lane);
    await this.workspace.bitMap.write();

    return { result: true };
  }

  async diffStatus(
    sourceLaneId: LaneId,
    targetLaneId?: LaneId,
    options?: LaneDiffStatusOptions
  ): Promise<LaneDiffStatus> {
    const sourceLaneComponents = sourceLaneId.isDefault()
      ? (await this.getLaneDataOfDefaultLane())?.components.map((main) => ({ id: main.id, head: Ref.from(main.head) }))
      : (await this.loadLane(sourceLaneId))?.components;

    const targetLane = targetLaneId ? await this.loadLane(targetLaneId) : undefined;
    const targetLaneIds = targetLane?.toBitIds();
    const host = this.componentAspect.getHost();

    const targetMainHeads =
      !targetLaneId || targetLaneId?.isDefault()
        ? compact(
            await Promise.all(
              (sourceLaneComponents || []).map(async ({ id }) => {
                const componentId = await host.resolveComponentId(id);
                const headOnMain = await this.getHeadOnMain(componentId);
                return headOnMain ? id.changeVersion(headOnMain) : undefined;
              })
            )
          )
        : [];

    await this.importer.importObjectsFromMainIfExist(targetMainHeads);

    const diffProps = compact(
      await Promise.all(
        (sourceLaneComponents || []).map(async ({ id, head }) => {
          const componentId = await host.resolveComponentId(id);
          const sourceVersionObj = (await this.scope.legacyScope.objects.load(head, true)) as Version;

          if (sourceVersionObj.isRemoved()) {
            return null;
          }

          const headOnTargetLane = targetLaneIds
            ? targetLaneIds.searchWithoutVersion(id)?.version
            : await this.getHeadOnMain(componentId);

          if (headOnTargetLane) {
            const targetVersionObj = (await this.scope.legacyScope.objects.load(
              Ref.from(headOnTargetLane),
              true
            )) as Version;

            if (targetVersionObj.isRemoved()) {
              return null;
            }
          }

          const sourceHead = head.toString();
          const targetHead = headOnTargetLane;

          return { componentId, sourceHead, targetHead };
        })
      )
    );

    const results = await pMapSeries(diffProps, async ({ componentId, sourceHead, targetHead }) =>
      this.componentDiffStatus(componentId, sourceHead, targetHead, options)
    );

    return {
      source: sourceLaneId,
      target: targetLaneId || this.getDefaultLaneId(),
      componentsStatus: results,
    };
  }

  async componentDiffStatus(
    componentId: ComponentID,
    sourceHead: string,
    targetHead?: string,
    options?: LaneDiffStatusOptions
  ): Promise<LaneComponentDiffStatus> {
    const snapsDistance = await this.getSnapsDistance(componentId, sourceHead, targetHead, false);

    if (snapsDistance?.err) {
      const noCommonSnap = snapsDistance.err instanceof NoCommonSnap;

      return {
        componentId,
        sourceHead,
        targetHead,
        upToDate: snapsDistance?.isUpToDate(),
        unrelated: noCommonSnap || undefined,
        changes: [],
      };
    }

    const commonSnap = snapsDistance?.commonSnapBeforeDiverge;

    const getChanges = async (): Promise<ChangeType[]> => {
      if (!commonSnap) return [ChangeType.NEW];

      const compare = await this.componentCompare.compare(
        componentId.changeVersion(commonSnap.hash).toString(),
        componentId.changeVersion(sourceHead).toString()
      );

      if (!compare.fields.length && (!compare.code.length || !compare.code.some((c) => c.status !== 'UNCHANGED'))) {
        return [ChangeType.NONE];
      }

      const changed: ChangeType[] = [];

      if (compare.code.some((f) => f.status !== 'UNCHANGED')) {
        changed.push(ChangeType.SOURCE_CODE);
      }

      if (compare.fields.length > 0) {
        changed.push(ChangeType.ASPECTS);
      }

      const depsFields = ['dependencies', 'devDependencies', 'extensionDependencies'];
      if (compare.fields.some((field) => depsFields.includes(field.fieldName))) {
        changed.push(ChangeType.DEPENDENCY);
      }

      return changed;
    };

    const changes = !options?.skipChanges ? await getChanges() : undefined;
    const changeType = changes ? changes[0] : undefined;

    return {
      componentId,
      changeType,
      changes,
      sourceHead,
      targetHead: commonSnap?.hash,
      upToDate: snapsDistance?.isUpToDate(),
      snapsDistance: {
        onSource: snapsDistance?.snapsOnSourceOnly.map((s) => s.hash) ?? [],
        onTarget: snapsDistance?.snapsOnTargetOnly.map((s) => s.hash) ?? [],
        common: snapsDistance?.commonSnapBeforeDiverge?.hash,
      },
    };
  }

  private async recreateNewLaneIfDeleted() {
    if (!this.workspace) return;
    const laneId = this.getCurrentLaneId();
    if (!laneId || laneId.isDefault() || this.workspace.consumer.bitMap.isLaneExported) {
      return;
    }
    const laneObj = await this.scope.legacyScope.getCurrentLaneObject();
    if (laneObj) {
      return;
    }
    await this.createLane(laneId.name, { scope: laneId.scope });
  }

  async addLaneReadme(readmeComponentIdStr: string, laneName?: string): Promise<{ result: boolean; message?: string }> {
    if (!this.workspace) {
      throw new BitError(`unable to track a lane readme component outside of Bit workspace`);
    }
    const readmeComponentId = await this.workspace.resolveComponentId(readmeComponentIdStr);

    const readmeComponentBitId = readmeComponentId._legacy;
    const scope: LegacyScope = this.workspace.scope.legacyScope;
    const laneId: LaneId = laneName
      ? await scope.lanes.parseLaneIdFromString(laneName)
      : (this.getCurrentLaneId() as LaneId);

    const lane: Lane | null | undefined = await scope.loadLane(laneId);

    if (!lane) {
      return { result: false, message: `cannot find lane ${laneName}` };
    }

    lane.setReadmeComponent(readmeComponentBitId);
    await scope.lanes.saveLane(lane);

    const existingLaneConfig =
      (await this.workspace.getSpecificComponentConfig(readmeComponentId, LanesAspect.id)) || {};

    const remoteLaneIdStr = lane.toLaneId().toString();

    if (existingLaneConfig.readme) {
      await this.workspace.addSpecificComponentConfig(readmeComponentId, LanesAspect.id, {
        ...existingLaneConfig,
        readme: {
          ...existingLaneConfig.readme,
          [remoteLaneIdStr]: true,
        },
      });
    } else {
      await this.workspace.addSpecificComponentConfig(readmeComponentId, LanesAspect.id, {
        ...existingLaneConfig,
        readme: {
          [remoteLaneIdStr]: true,
        },
      });
    }
    await this.workspace.bitMap.write();
    return { result: true };
  }

  /**
   * if the local lane was forked from another lane, this gets the differences between the two.
   * it also fetches the original lane from the remote to make sure the data is up to date.
   */
  async listUpdatesFromForked(componentsList: ComponentsList): Promise<DivergeDataPerId[]> {
    const consumer = this.workspace?.consumer;
    if (!consumer) throw new Error(`unable to get listUpdatesFromForked outside of a workspace`);
    if (consumer.isOnMain()) {
      return [];
    }
    const lane = await consumer.getCurrentLaneObject();
    const forkedFromLaneId = lane?.forkedFrom;
    if (!forkedFromLaneId) {
      return [];
    }
    const forkedFromLane = await consumer.scope.loadLane(forkedFromLaneId);
    if (!forkedFromLane) return []; // should we fetch it here?

    const workspaceIds = consumer.bitMap.getAllBitIds();

    const duringMergeIds = componentsList.listDuringMergeStateComponents();

    const componentsFromModel = await componentsList.getModelComponents();
    const compFromModelOnWorkspace = componentsFromModel
      .filter((c) => workspaceIds.hasWithoutVersion(c.toBitId()))
      // if a component is merge-pending, it needs to be resolved first before getting more updates from main
      .filter((c) => !duringMergeIds.hasWithoutVersion(c.toBitId()));

    // by default, when on a lane, forked is not fetched. we need to fetch it to get the latest updates.
    await this.fetchLaneWithItsComponents(forkedFromLaneId);

    const remoteForkedLane = await consumer.scope.objects.remoteLanes.getRemoteLane(forkedFromLaneId);
    if (!remoteForkedLane.length) return [];

    const results = await Promise.all(
      compFromModelOnWorkspace.map(async (modelComponent) => {
        const headOnForked = remoteForkedLane.find((c) => c.id.isEqualWithoutVersion(modelComponent.toBitId()));
        const headOnLane = modelComponent.laneHeadLocal;
        if (!headOnForked || !headOnLane) return undefined;
        const divergeData = await getDivergeData({
          repo: consumer.scope.objects,
          modelComponent,
          targetHead: headOnForked.head,
          sourceHead: headOnLane,
          throws: false,
        });
        if (!divergeData.snapsOnTargetOnly.length && !divergeData.err) return undefined;
        return { id: modelComponent.toBitId(), divergeData };
      })
    );

    return compact(results);
  }

  private async getLaneDataOfDefaultLane(): Promise<LaneData | null> {
    const consumer = this.workspace?.consumer;
    let bitIds: BitId[] = [];
    if (!consumer) {
      const scopeComponents = await this.scope.list();
      bitIds = scopeComponents.filter((component) => component.head).map((component) => component.id._legacy);
    } else {
      bitIds = await consumer.getIdsOfDefaultLane();
    }

    return {
      name: DEFAULT_LANE,
      remote: null,
      id: this.getDefaultLaneId(),
      components: bitIds.map((bitId) => ({ id: bitId, head: bitId.version as string })),
      isMerged: null,
      hash: '',
    };
  }

  get createRoutePath() {
    return '/lanes/create';
  }

  get deleteRoutePath() {
    return '/lanes/delete';
  }

  get restoreRoutePath() {
    return '/lanes/restore';
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    ScopeAspect,
    WorkspaceAspect,
    GraphqlAspect,
    MergingAspect,
    ComponentAspect,
    LoggerAspect,
    ImporterAspect,
    ExportAspect,
    ExpressAspect,
    ComponentCompareAspect,
    ComponentWriterAspect,
    RemoveAspect,
    CheckoutAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    scope,
    workspace,
    graphql,
    merging,
    component,
    loggerMain,
    importer,
    exporter,
    express,
    componentCompare,
    componentWriter,
    remove,
    checkout,
  ]: [
    CLIMain,
    ScopeMain,
    Workspace,
    GraphqlMain,
    MergingMain,
    ComponentMain,
    LoggerMain,
    ImporterMain,
    ExportMain,
    ExpressMain,
    ComponentCompareMain,
    ComponentWriterMain,
    RemoveMain,
    CheckoutMain
  ]) {
    const logger = loggerMain.createLogger(LanesAspect.id);
    const lanesMain = new LanesMain(
      workspace,
      scope,
      merging,
      component,
      logger,
      importer,
      exporter,
      componentCompare,
      componentWriter,
      remove,
      checkout
    );
    const switchCmd = new SwitchCmd(lanesMain);
    const laneCmd = new LaneCmd(lanesMain, workspace, scope);
    laneCmd.commands = [
      new LaneListCmd(lanesMain, workspace, scope),
      switchCmd,
      new LaneShowCmd(lanesMain, workspace, scope),
      new LaneCreateCmd(lanesMain),
      new LaneRemoveCmd(lanesMain),
      new LaneChangeScopeCmd(lanesMain),
      new LaneAliasCmd(lanesMain),
      new LaneRenameCmd(lanesMain),
      new LaneDiffCmd(workspace, scope),
      new LaneAddReadmeCmd(lanesMain),
      new LaneRemoveReadmeCmd(lanesMain),
      new LaneImportCmd(switchCmd),
      new LaneRemoveCompCmd(workspace, lanesMain),
    ];
    cli.register(laneCmd, switchCmd);
    cli.registerOnStart(async () => {
      await lanesMain.recreateNewLaneIfDeleted();
    });
    graphql.register(lanesSchema(lanesMain));
    express.register([
      new LanesCreateRoute(lanesMain, logger),
      new LanesDeleteRoute(lanesMain, logger),
      new LanesRestoreRoute(lanesMain, logger),
    ]);
    return lanesMain;
  }
}

LanesAspect.addRuntime(LanesMain);

export default LanesMain;
