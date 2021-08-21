import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { LaneDiffCmd, LaneDiffGenerator } from '@teambit/lanes.modules.diff';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { BitError } from '@teambit/bit-error';
import createNewLane from '@teambit/legacy/dist/consumer/lanes/create-lane';
import { mergeLanes } from '@teambit/legacy/dist/consumer/lanes/merge-lanes';
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import { MergeStrategy, ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import removeLanes from '@teambit/legacy/dist/consumer/lanes/remove-lanes';
import { LanesAspect } from './lanes.aspect';
import { LaneCmd, LaneCreateCmd, LaneListCmd, LaneMergeCmd, LaneRemoveCmd, LaneShowCmd } from './lane.cmd';
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

  async createLane(name: string) {
    if (!this.workspace) {
      throw new BitError(`unable to create a lane outside of Bit workspace`);
    }
    await createNewLane(this.workspace.consumer, name);
    this.scope.legacyScope.lanes.setCurrentLane(name);
    const results = { added: name };
    await this.workspace.consumer.onDestroy();

    return results;
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
  public getDiff(values: string[]) {
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope);
    return laneDiffGenerator.generate(values);
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
        new LaneDiffCmd(workspace, scope),
      ];
      cli.register(laneCmd);
      graphql.register(lanesSchema(lanesMain));
    }
    return lanesMain;
  }
}

LanesAspect.addRuntime(LanesMain);
