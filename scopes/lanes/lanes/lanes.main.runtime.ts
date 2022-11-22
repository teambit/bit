import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
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
import { ImporterAspect, ImporterMain, ImportOptions } from '@teambit/importer';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import removeLanes from '@teambit/legacy/dist/consumer/lanes/remove-lanes';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { LaneNotFound } from '@teambit/legacy/dist/api/scope/lib/exceptions/lane-not-found';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { Scope as LegacyScope } from '@teambit/legacy/dist/scope';
import { BitId } from '@teambit/legacy-bit-id';
import { ExportAspect, ExportMain } from '@teambit/export';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { MergingMain, MergingAspect } from '@teambit/merging';
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

export class LanesMain {
  constructor(
    private workspace: Workspace | undefined,
    private scope: ScopeMain,
    private merging: MergingMain,
    private componentAspect: ComponentMain,
    public logger: Logger,
    private importer: ImporterMain,
    private exporter: ExportMain
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

    return lanes;
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

  async createLane(name: string, { remoteScope, alias }: CreateLaneOptions = {}): Promise<TrackLane> {
    if (!this.workspace) {
      const newLane = await createLaneInScope(name, this.scope);
      return {
        localLane: newLane.name,
        remoteLane: newLane.name,
        remoteScope: this.scope.name,
      };
    }
    if (alias) {
      throwForInvalidLaneName(alias);
    }
    const scope = remoteScope || this.workspace.defaultScope;
    await createLane(this.workspace.consumer, name, scope);
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

    return trackLaneData;
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

  /**
   * get a Lane object from the remote.
   * `persistIfNotExists` saves the object in the local scope only if the lane is not there yet.
   * otherwise, it needs some merging mechanism, which is done differently whether it's export or import.
   * see `sources.mergeLane()` for export and `import-components._saveLaneDataIfNeeded()` for import.
   * in this case, because we only bring the lane object and not the components, it's not easy to do the merge.
   */
  async importLaneObject(laneId: LaneId, persistIfNotExists = true): Promise<Lane> {
    const legacyScope = this.scope.legacyScope;
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(legacyScope);
    const results = await scopeComponentImporter.importLanes([laneId]);
    const laneObject = results[0];
    if (!laneObject) throw new LaneNotFound(laneId.scope, laneId.name);

    if (persistIfNotExists) {
      const exists = await legacyScope.loadLane(laneId);
      if (!exists) {
        await legacyScope.lanes.saveLane(laneObject);
      }
    }

    return laneObject;
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
    const lane = await this.importLaneObject(laneId);
    if (!lane) throw new Error(`unable to import lane ${laneId.toString()} from the remote`);
    const importOptions: ImportOptions = {
      ids: [],
      objectsOnly: true,
      verbose: false,
      writeConfig: false,
      override: false,
      installNpmPackages: false,
      lanes: { laneIds: [laneId], lanes: [lane] },
    };
    const { importedIds } = await this.importer.importWithOptions(importOptions);
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
   * check whether the given lane is up-to-date against "checkAgainst", if this param is null, it checks it against main.
   */
  async isLaneUpToDate(laneToCheck: Lane, checkAgainst?: Lane): Promise<boolean> {
    const upToDateIds: BitId[] = [];
    const notUpToDateIds: BitId[] = [];
    const getHashOnAnotherLane = async (id: BitId): Promise<Ref | undefined> => {
      if (checkAgainst) {
        const idOnLane = checkAgainst.getComponent(id);
        return idOnLane?.head;
      }
      const modelComp = await this.scope.legacyScope.getModelComponent(id);
      return modelComp.head;
    };
    await Promise.all(
      laneToCheck.components.map(async (comp) => {
        const refOnOtherLane = await getHashOnAnotherLane(comp.id);
        if (!refOnOtherLane) {
          upToDateIds.push(comp.id);
          return;
        }
        if (comp.head.isEqual(refOnOtherLane)) {
          upToDateIds.push(comp.id);
          return;
        }
        const modelComponent = await this.scope.legacyScope.getModelComponent(comp.id);
        const divergeData = await getDivergeData({
          repo: this.scope.legacyScope.objects,
          modelComponent,
          remoteHead: refOnOtherLane,
          checkedOutLocalHead: comp.head,
        });
        if (divergeData.isRemoteAhead() || divergeData.isDiverged()) {
          notUpToDateIds.push(comp.id);
          return;
        }
        if (!divergeData.isLocalAhead()) {
          throw new Error(
            `invalid state - component ${comp.id.toString()} is not diverged, not local-ahead and not-remote-ahead.`
          );
        }
        upToDateIds.push(comp.id);
      })
    );

    const isUpToDate = !notUpToDateIds.length;

    return isUpToDate;
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
    CommunityAspect,
    MergingAspect,
    ComponentAspect,
    LoggerAspect,
    ImporterAspect,
    ExportAspect,
    ExpressAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    scope,
    workspace,
    graphql,
    community,
    merging,
    component,
    loggerMain,
    importer,
    exporter,
    express,
  ]: [
    CLIMain,
    ScopeMain,
    Workspace,
    GraphqlMain,
    CommunityMain,
    MergingMain,
    ComponentMain,
    LoggerMain,
    ImporterMain,
    ExportMain,
    ExpressMain
  ]) {
    const logger = loggerMain.createLogger(LanesAspect.id);
    const lanesMain = new LanesMain(workspace, scope, merging, component, logger, importer, exporter);
    const switchCmd = new SwitchCmd(lanesMain);
    const laneCmd = new LaneCmd(lanesMain, workspace, scope, community.getDocsDomain());
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
