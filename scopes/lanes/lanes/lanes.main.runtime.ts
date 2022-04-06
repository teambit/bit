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
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import { DiffOptions } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { MergeStrategy, ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { TrackLane } from '@teambit/legacy/dist/scope/scope-json';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import { Component } from '@teambit/component';
import removeLanes from '@teambit/legacy/dist/consumer/lanes/remove-lanes';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { Scope } from '@teambit/legacy/dist/scope';
import { DocsMain } from '@teambit/docs';
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
  LaneReadmeAddCmd,
  LaneReadmeRemoveCmd,
} from './lane.cmd';
import { lanesSchema } from './lanes.graphql';
import { SwitchCmd } from './switch.cmd';
import { mergeLanes } from './merge-lanes';

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
  deleteReadme: boolean;
};

export type CreateLaneOptions = {
  remoteScope?: string; // default to the defaultScope in workspace.jsonc
  remoteName?: string; // default to the local lane
};

export class LanesMain {
  constructor(private workspace: Workspace | undefined, private scope: ScopeMain, private merging: MergingMain) {}

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

  async createLane(name: string, { remoteScope, remoteName }: CreateLaneOptions = {}): Promise<TrackLane> {
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

  async getLaneComponentModels(name: string): Promise<Component[]> {
    if (!name) return [];

    const [lane] = await this.getLanes({ name });
    const laneComponents = lane.components;
    const host = this.workspace || this.scope;
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
    const host = this.workspace || this.scope;
    const laneReadmeComponentId = await host.resolveComponentId(
      laneReadmeComponent.id.changeVersion(laneReadmeComponent.head)
    );
    const readmeComponent = await host.get(laneReadmeComponentId);
    return readmeComponent;
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

  public isLaneReadme(component: Component) {
    const lanesConfig = component.state.aspects.get(LanesAspect.id)?.config;
    if (!lanesConfig) return false;

    return Object.keys(lanesConfig).some((lane) => lanesConfig[lane].readme);
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

    const laneId: LaneId = (laneName && LaneId.from(laneName)) || LaneId.from(currentLaneName as string);
    const scope: Scope = this.workspace.scope.legacyScope;
    const lane: Lane | null | undefined = await scope.loadLane(laneId);

    if (!lane?.readmeComponent) {
      return {
        result: false,
        message: `there is no readme component added to the lane ${laneName || currentLaneName}`,
      };
    }

    const readmeComponentId = await this.workspace.resolveComponentId(lane.readmeComponent.id);
    const existingLaneConfig =
      (await this.workspace.getSpecificComponentConfig(readmeComponentId, LanesAspect.id)) || {};

    if (existingLaneConfig !== '-') {
      delete existingLaneConfig[lane.name];
      // this.workspace.bitMap.removeComponentConfig(readmeComponentId, LanesAspect.id, false);
      await this.workspace.removeSpecificComponentConfig(readmeComponentId, LanesAspect.id, false);
      await this.workspace.addSpecificComponentConfig(readmeComponentId, LanesAspect.id, existingLaneConfig);
    } else {
      // this should not happen but is it still possible to set the config as "-"
      await this.workspace.removeSpecificComponentConfig(readmeComponentId, LanesAspect.id, false);
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

    const currentLaneName = this.getCurrentLane();

    const readmeComponentBitId = readmeComponentId._legacy;

    const laneId: LaneId = (laneName && LaneId.from(laneName)) || LaneId.from(currentLaneName as string);
    const scope: Scope = this.workspace.scope.legacyScope;
    const lane: Lane | null | undefined = await scope.loadLane(laneId);

    if (!lane) {
      return { result: false, message: `cannot find lane ${laneName}` };
    }

    lane.setReadmeComponent(readmeComponentBitId);
    await scope.lanes.saveLane(lane);

    // const existingLaneConfig = this.workspace.bitMap.getBitmapEntry(readmeComponentId)?.config?.[LanesAspect.id] || {};
    const existingLaneConfig =
      (await this.workspace.getSpecificComponentConfig(readmeComponentId, LanesAspect.id)) || {};
    if (existingLaneConfig !== '-') {
      await this.workspace.addSpecificComponentConfig(readmeComponentId, LanesAspect.id, {
        ...existingLaneConfig,
        [lane.name]: { readme: true },
      });
    } else {
      // this should not happen but is it still possible to set the config as "-"
      await this.workspace.addSpecificComponentConfig(readmeComponentId, LanesAspect.id, {
        [lane.name]: { readme: true },
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
  static dependencies = [CLIAspect, ScopeAspect, WorkspaceAspect, GraphqlAspect, CommunityAspect, MergingAspect];
  static runtime = MainRuntime;
  static async provider([cli, scope, workspace, graphql, community, merging]: [
    CLIMain,
    ScopeMain,
    Workspace,
    GraphqlMain,
    CommunityMain,
    MergingMain,
    DocsMain
  ]) {
    const lanesMain = new LanesMain(workspace, scope, merging);
    const isLegacy = workspace && workspace.consumer.isLegacy;
    const switchCmd = new SwitchCmd();
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
        new LaneReadmeAddCmd(lanesMain),
        new LaneReadmeRemoveCmd(lanesMain),
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
