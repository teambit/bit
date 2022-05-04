import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { LaneDiffCmd, LaneDiffGenerator } from '@teambit/lanes.modules.diff';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { DiffOptions } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import {
  MergeStrategy,
  ApplyVersionResults,
  MergeOptions,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { TrackLane } from '@teambit/legacy/dist/scope/scope-json';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import removeLanes from '@teambit/legacy/dist/consumer/lanes/remove-lanes';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { Scope as LegacyScope } from '@teambit/legacy/dist/scope';
import { BitId } from '@teambit/legacy-bit-id';
import { MergingMain, MergingAspect } from '@teambit/merging';
import { LanesAspect } from './lanes.aspect';
import {
  LaneCmd,
  LaneCreateCmd,
  LaneImportCmd,
  LaneListCmd,
  LaneMergeCmd,
  LaneRemoveCmd,
  LaneShowCmd,
  LaneTrackCmd,
  LaneAddReadmeCmd,
  LaneRemoveReadmeCmd,
} from './lane.cmd';
import { lanesSchema } from './lanes.graphql';
import { SwitchCmd } from './switch.cmd';
import { mergeLanes } from './merge-lanes';
import { LaneSwitcher } from './switch-lanes';
import { createLane } from './create-lane';

export type LaneResults = {
  lanes: LaneData[];
  currentLane?: string | null;
};

export type MergeLaneOptions = {
  remoteName: string | null;
  mergeStrategy: MergeStrategy;
  noSnap: boolean;
  snapMessage: string;
  existingOnWorkspaceOnly: boolean;
  build: boolean;
  keepReadme: boolean;
};

export type CreateLaneOptions = {
  remoteScope?: string; // default to the defaultScope in workspace.jsonc
  remoteName?: string; // default to the local lane
};

export type SwitchLaneOptions = {
  newLaneName?: string;
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
    private logger: Logger
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

  getCurrentLane(): string | null {
    if (!this.workspace?.consumer) return null;
    return this.scope.legacyScope.lanes.getCurrentLaneName();
  }

  getCurrentLaneId(): LaneId | null {
    if (!this.workspace) return null;
    return this.scope.legacyScope.lanes.getCurrentLaneId();
  }

  async createLane(name: string, { remoteScope, remoteName }: CreateLaneOptions = {}): Promise<TrackLane> {
    if (!this.workspace) {
      throw new BitError(`unable to create a lane outside of Bit workspace`);
    }
    const scope = remoteScope || this.workspace.defaultScope;
    await createLane(this.workspace.consumer, name, scope);
    this.scope.legacyScope.lanes.setCurrentLane(name);
    const trackLaneData = {
      localLane: name,
      remoteLane: remoteName || name,
      remoteScope: scope,
    };
    this.scope.legacyScope.lanes.trackLane(trackLaneData);
    await this.workspace.consumer.onDestroy();

    return trackLaneData;
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
    const lane = await this.scope.legacyScope.lanes.loadLane(laneId);
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

  async removeLanes(laneNames: string[], { remote, force }: { remote: boolean; force: boolean }): Promise<string[]> {
    const results = await removeLanes(this.workspace?.consumer, laneNames, remote, force);
    if (this.workspace) await this.workspace.consumer.onDestroy();

    return results.laneResults;
  }

  async mergeLane(
    laneName: string,
    options: MergeLaneOptions
  ): Promise<{ mergeResults: ApplyVersionResults; deleteResults: any }> {
    if (!this.workspace) {
      throw new BitError(`unable to merge a lane outside of Bit workspace`);
    }
    const results = await mergeLanes({
      merging: this.merging,
      consumer: this.workspace.consumer,
      laneName,
      ...options,
    });

    await this.workspace.consumer.onDestroy();
    this.workspace.consumer.bitMap.syncWithLanes(this.workspace.consumer.bitMap.workspaceLane);
    return results;
  }

  /**
   * switch to a different local or remote lane.
   * switching to a remote lane also imports and writes the components of that remote lane.
   * by default, only the components existing on the workspace will be imported from that lane, unless the "getAll"
   * flag is true.
   */
  async switchLanes(
    laneName: string,
    { newLaneName, merge, getAll = false, skipDependencyInstallation = false }: SwitchLaneOptions
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

    const switchProps = {
      laneName,
      existingOnWorkspaceOnly: !getAll,
      newLaneName,
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
    return new LaneSwitcher(this.workspace, this.logger, switchProps, checkoutProps).switch();
  }

  /**
   * the values array may include zero to two values and will be processed as following:
   * [] => diff between the current lane and default lane. (only inside workspace).
   * [to] => diff between the current lane (or default-lane when in scope) and "to" lane.
   * [from, to] => diff between "from" lane and "to" lane.
   */
  public getDiff(values: string[], diffOptions: DiffOptions = {}) {
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope);
    return laneDiffGenerator.generate(values, diffOptions);
  }

  async getLaneComponentModels(name: string): Promise<Component[]> {
    if (!name) return [];

    const [lane] = await this.getLanes({ name });
    const laneComponents = lane.components;
    const host = this.componentAspect.getHost();
    const laneComponentIds = await Promise.all(
      laneComponents.map((laneComponent) => {
        const legacyIdWithVersion = laneComponent.id.changeVersion(laneComponent.head);
        return host.resolveComponentId(legacyIdWithVersion);
      })
    );
    const components = await host.getMany(laneComponentIds);
    return components;
  }

  async getLaneReadmeComponent(name: string): Promise<Component | undefined> {
    if (!name) return undefined;

    const [lane] = await this.getLanes({ name });
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
    const currentLaneName = this.getCurrentLane();

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

    const remoteLaneIdStr = (lane.remoteLaneId || LaneId.from(laneId.name, lane.scope)).toString();

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

    const remoteLaneIdStr = (lane.remoteLaneId || LaneId.from(laneId.name, lane.scope)).toString();

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
      bitIds = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
    }

    return {
      name: DEFAULT_LANE,
      remote: null,
      components: bitIds.map((bitId) => ({ id: bitId, head: bitId.version as string })),
      isMerged: null,
    };
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
  ];
  static runtime = MainRuntime;
  static async provider([cli, scope, workspace, graphql, community, merging, component, loggerMain]: [
    CLIMain,
    ScopeMain,
    Workspace,
    GraphqlMain,
    CommunityMain,
    MergingMain,
    ComponentMain,
    LoggerMain
  ]) {
    const logger = loggerMain.createLogger(LanesAspect.id);
    const lanesMain = new LanesMain(workspace, scope, merging, component, logger);
    const isLegacy = workspace && workspace.consumer.isLegacy;
    const switchCmd = new SwitchCmd(lanesMain);
    if (!isLegacy) {
      const laneCmd = new LaneCmd(lanesMain, workspace, scope, community.getDocsDomain());
      laneCmd.commands = [
        new LaneListCmd(lanesMain, workspace, scope),
        switchCmd,
        new LaneShowCmd(lanesMain, workspace, scope),
        new LaneCreateCmd(lanesMain),
        new LaneMergeCmd(lanesMain),
        new LaneRemoveCmd(lanesMain),
        new LaneTrackCmd(lanesMain),
        new LaneDiffCmd(workspace, scope),
        new LaneAddReadmeCmd(lanesMain),
        new LaneRemoveReadmeCmd(lanesMain),
        new LaneImportCmd(switchCmd),
      ];
      cli.register(laneCmd, switchCmd);
      graphql.register(lanesSchema(lanesMain));
    }
    return lanesMain;
  }
}

LanesAspect.addRuntime(LanesMain);

export default LanesMain;
