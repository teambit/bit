import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { LaneDiffCmd, LaneDiffGenerator } from '@teambit/lanes.modules.diff';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import LaneId from '@teambit/legacy/dist/lane-id/lane-id';
import { BitError } from '@teambit/bit-error';
import createNewLane from '@teambit/legacy/dist/consumer/lanes/create-lane';
import { mergeLanes } from '@teambit/legacy/dist/consumer/lanes/merge-lanes';
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import { DiffOptions } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { MergeStrategy, ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { TrackLane } from '@teambit/legacy/dist/scope/scope-json';
import removeLanes from '@teambit/legacy/dist/consumer/lanes/remove-lanes';
import { LanesAspect } from './lanes.aspect';
import {
  LaneCmd,
  LaneCreateCmd,
  LaneListCmd,
  LaneMergeCmd,
  LaneRemoveCmd,
  LaneShowCmd,
  LaneTrackCmd,
} from './lane.cmd';
import { lanesSchema } from './lanes.graphql';

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
};

export type CreateLaneOptions = {
  remoteScope?: string; // default to the defaultScope in workspace.jsonc
  remoteName?: string; // default to the local lane
};

export class LanesMain {
  constructor(private workspace: Workspace | undefined, private scope: ScopeMain) {}

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
    const lanes = await this.scope.legacyScope.lanes.getLanesData(this.scope.legacyScope, name, showMergeData);

    if (showDefaultLane) {
      const defaultLane = this.getLaneDataOfDefaultLane();
      if (defaultLane) lanes.push(defaultLane);
    }

    return lanes;
  }

  getCurrentLane(): string | null {
    if (!this.workspace?.consumer) return null;
    return this.scope.legacyScope.lanes.getCurrentLaneName();
  }

  async createLane(name: string, { remoteScope, remoteName }: CreateLaneOptions): Promise<TrackLane> {
    if (!this.workspace) {
      throw new BitError(`unable to create a lane outside of Bit workspace`);
    }
    await createNewLane(this.workspace.consumer, name);
    this.scope.legacyScope.lanes.setCurrentLane(name);
    const trackLaneData = {
      localLane: name,
      remoteLane: remoteName || name,
      remoteScope: remoteScope || this.workspace.defaultScope,
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
    const lane = await this.scope.legacyScope.lanes.loadLane(LaneId.from(localName));
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

  async mergeLane(laneName: string, options: MergeLaneOptions): Promise<ApplyVersionResults> {
    if (!this.workspace) {
      throw new BitError(`unable to merge a lane outside of Bit workspace`);
    }
    const mergeResults = await mergeLanes({
      consumer: this.workspace.consumer,
      laneName,
      ...options,
    });
    await this.workspace.consumer.onDestroy();

    return mergeResults;
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

  private getLaneDataOfDefaultLane(): LaneData | null {
    const consumer = this.workspace?.consumer;
    if (!consumer) return null;
    const bitIds = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
    return {
      name: DEFAULT_LANE,
      remote: null,
      components: bitIds.map((bitId) => ({ id: bitId, head: bitId.version as string })),
      isMerged: null,
    };
  }

  static slots = [];
  static dependencies = [CLIAspect, ScopeAspect, WorkspaceAspect, GraphqlAspect];
  static runtime = MainRuntime;
  static async provider([cli, scope, workspace, graphql]: [CLIMain, ScopeMain, Workspace, GraphqlMain]) {
    const lanesMain = new LanesMain(workspace, scope);
    const isLegacy = workspace && workspace.consumer.isLegacy;
    if (!isLegacy) {
      const laneCmd = new LaneCmd(lanesMain, workspace, scope);
      laneCmd.commands = [
        new LaneListCmd(lanesMain, workspace, scope),
        new LaneShowCmd(lanesMain, workspace, scope),
        new LaneCreateCmd(lanesMain),
        new LaneMergeCmd(lanesMain),
        new LaneRemoveCmd(lanesMain),
        new LaneTrackCmd(lanesMain),
        new LaneDiffCmd(workspace, scope),
      ];
      cli.register(laneCmd);
      graphql.register(lanesSchema(lanesMain));
    }
    return lanesMain;
  }
}

LanesAspect.addRuntime(LanesMain);
