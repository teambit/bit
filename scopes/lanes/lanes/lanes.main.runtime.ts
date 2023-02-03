import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import pMapSeries from 'p-map-series';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
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
import { BitId } from '@teambit/legacy-bit-id';
import { ExportAspect, ExportMain } from '@teambit/export';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { compact } from 'lodash';
import { ComponentCompareMain, ComponentCompareAspect } from '@teambit/component-compare';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import ComponentWriterAspect, { ComponentWriterMain } from '@teambit/component-writer';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { MergingMain, MergingAspect } from '@teambit/merging';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
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
} from './lane.cmd';
import { lanesSchema } from './lanes.graphql';
import { SwitchCmd } from './switch.cmd';
import { LaneSwitcher } from './switch-lanes';
import { createLane, createLaneInScope, throwForInvalidLaneName } from './create-lane';
import { LanesCreateRoute } from './lanes.create.route';
import { LanesDeleteRoute } from './lanes.delete.route';

export { Lane };

export type LaneResults = {
  lanes: LaneData[];
  currentLane?: string | null;
};

export type CreateLaneOptions = {
  remoteScope?: string; // default to the defaultScope in workspace.jsonc
  alias?: string; // default to the remote name
};

export type SwitchLaneOptions = {
  alias?: string;
  merge?: MergeStrategy;
  getAll?: boolean;
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
};

export type LaneDiffStatusOptions = {
  skipChanges?: boolean;
  skipUpToDate?: boolean;
};

export type LaneDiffStatus = {
  source: LaneId;
  target: LaneId;
  componentsStatus: LaneComponentDiffStatus[];
};

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
    readonly componentWriter: ComponentWriterMain
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
      const remoteObj = await getRemoteByName(remote, consumer);
      const lanes = await remoteObj.listLanes(name, showMergeData);
      return this.filterSoftRemovedLaneComps(lanes);
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

  private async filterSoftRemovedLaneComps(lanes: LaneData[]): Promise<LaneData[]> {
    return Promise.all(
      lanes.map(async (lane) => {
        if (lane.id.isDefault()) return lane;

        const componentIds = compact(
          await Promise.all(
            (
              await this.getLaneComponentIds(lane)
            ).map(async (laneCompId) => {
              if (await this.scope.isComponentRemoved(laneCompId)) return undefined;
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

  async createLane(name: string, { remoteScope, alias }: CreateLaneOptions = {}): Promise<CreateLaneResult> {
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
    const scope = remoteScope || this.workspace.defaultScope;
    const laneObj = await createLane(this.workspace.consumer, name, scope);
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
    const currentLaneName = this.getCurrentLaneName();
    if (currentLaneName === laneNameWithoutScope) {
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
  async getSnapsDistance(componentId: ComponentID, sourceHead?: string, targetHead?: string): Promise<SnapsDistance> {
    if (!sourceHead && !targetHead)
      throw new Error(`getDivergeData got sourceHead and targetHead empty. at least one of them should be populated`);
    const modelComponent = await this.scope.legacyScope.getModelComponent(componentId._legacy);
    return getDivergeData({
      modelComponent,
      repo: this.scope.legacyScope.objects,
      sourceHead: sourceHead ? Ref.from(sourceHead) : modelComponent.head || null,
      targetHead: targetHead ? Ref.from(targetHead) : modelComponent.head || null,
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
   * save the objects to the local scope.
   * this method doesn't change anything in the workspace.
   */
  async fetchLaneWithItsComponents(laneId: LaneId): Promise<Lane> {
    this.logger.debug(`fetching lane ${laneId.toString()}`);
    if (!this.workspace) {
      throw new BitError('unable to fetch lanes outside of Bit workspace');
    }
    const lane = await this.importer.importLaneObject(laneId);
    if (!lane) throw new Error(`unable to import lane ${laneId.toString()} from the remote`);
    const { importedIds } = await this.importer.fetchLaneWithComponents(lane);
    this.logger.debug(`fetching lane ${laneId.toString()} done, fetched ${importedIds.length} components`);
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
   * switch to a different local or remote lane.
   * switching to a remote lane also imports and writes the components of that remote lane.
   * by default, only the components existing on the workspace will be imported from that lane, unless the "getAll"
   * flag is true.
   */
  async switchLanes(
    laneName: string,
    { alias, merge, getAll = false, skipDependencyInstallation = false }: SwitchLaneOptions
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
    const sourceLane = await this.loadLane(sourceLaneId);
    if (!sourceLane) throw new Error(`unable to find ${sourceLaneId.toString()} in the scope`);
    const targetLane = targetLaneId ? await this.loadLane(targetLaneId) : undefined;
    const targetLaneIds = targetLane?.toBitIds();
    const host = this.componentAspect.getHost();
    const diffProps = compact(
      await Promise.all(
        sourceLane.components.map(async (comp) => {
          const componentId = await host.resolveComponentId(comp.id);
          const sourceVersionObj = (await this.scope.legacyScope.objects.load(comp.head)) as Version;
          if (sourceVersionObj.isRemoved()) {
            return null;
          }
          const headOnTargetLane = targetLaneIds
            ? targetLaneIds.searchWithoutVersion(comp.id)?.version
            : await this.getHeadOnMain(componentId);

          if (headOnTargetLane) {
            const targetVersionObj = (await this.scope.legacyScope.objects.load(Ref.from(headOnTargetLane))) as Version;
            if (targetVersionObj.isRemoved()) {
              return null;
            }
          }

          const sourceHead = comp.head.toString();
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
  ) {
    const snapsDistance = !options?.skipUpToDate
      ? await this.getSnapsDistance(componentId, sourceHead, targetHead)
      : undefined;

    const getChanges = async (): Promise<ChangeType[]> => {
      if (!targetHead) return [ChangeType.NEW];

      const compare = await this.componentCompare.compare(
        componentId.changeVersion(targetHead).toString(),
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

    return { componentId, changeType, changes, sourceHead, targetHead, upToDate: snapsDistance?.isUpToDate() };
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
    ComponentWriterMain
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
      componentWriter
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
    ];
    cli.register(laneCmd, switchCmd);
    graphql.register(lanesSchema(lanesMain));
    express.register([new LanesCreateRoute(lanesMain, logger), new LanesDeleteRoute(lanesMain, logger)]);
    return lanesMain;
  }
}

LanesAspect.addRuntime(LanesMain);

export default LanesMain;
