import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { BitId } from '@teambit/legacy-bit-id';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import {
  diffBetweenVersionsObjects,
  DiffResults,
  DiffOptions,
} from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import LaneId from '@teambit/legacy/dist/lane-id/lane-id';

type LaneData = {
  name: string;
  components: Array<{
    id: BitId;
    head: Ref;
  }>;
  remote: string | null;
  isMerged: boolean | null;
};
export class LaneDiffGenerator {
  private newComps: BitId[] = [];
  private compsWithDiff: DiffResults[] = [];
  private compsWithNoChanges: BitId[] = [];
  private fromLaneData: LaneData | null;
  private toLaneData: LaneData;
  constructor(private workspace: Workspace | undefined, private scope: ScopeMain) {}

  /**
   * the values array may include zero to two values and will be processed as following:
   * [] => diff between the current lane and default lane. (only inside workspace).
   * [to] => diff between the current lane (or default-lane when in scope) and "to" lane.
   * [from, to] => diff between "from" lane and "to" lane.
   */
  async generate(values: string[], diffOptions: DiffOptions = {}) {
    const { fromLaneName, toLaneName } = this.getLaneNames(values);
    if (fromLaneName === toLaneName) {
      throw new Error(`unable to run diff between "${fromLaneName}" and "${toLaneName}", they're the same lane`);
    }
    const legacyScope = this.scope.legacyScope;
    const fromLaneId = fromLaneName ? new LaneId({ name: fromLaneName }) : null;
    const toLaneId = toLaneName ? new LaneId({ name: toLaneName }) : null;
    const isFromOrToDefault = fromLaneId?.isDefault() || toLaneId?.isDefault();

    if (!isFromOrToDefault && !toLaneId) {
      throw new Error(`unable to find a lane "${toLaneName}" in the scope`);
    } else if (!isFromOrToDefault && toLaneId && fromLaneId) {
      const toLane = await legacyScope.lanes.loadLane(toLaneId);
      if (!toLane) throw new Error(`unable to find a lane "${toLaneName}" in the scope`);
      const fromLane = fromLaneId ? await legacyScope.lanes.loadLane(fromLaneId) : null;
      this.toLaneData = await this.mapToLaneData(toLane);
      this.fromLaneData = fromLane ? await this.mapToLaneData(fromLane) : null;
    } else if (fromLaneId?.isDefault() && toLaneId) {
      const toLane = await legacyScope.lanes.loadLane(toLaneId);
      if (!toLane) throw new Error(`unable to find a lane "${toLaneName}" in the scope`);

      this.toLaneData = await this.mapToLaneData(toLane);
      const bitIds = toLane.components.map((c) => c.id);
      this.fromLaneData = await this.getDefaultLaneData(bitIds);
    } else {
      const fromLane = fromLaneId ? await legacyScope.lanes.loadLane(fromLaneId) : null;
      this.fromLaneData = fromLane ? await this.mapToLaneData(fromLane) : null;
      const bitIds = fromLane?.components.map((c) => c.id) || [];
      this.toLaneData = await this.getDefaultLaneData(bitIds);
    }

    await Promise.all(
      this.toLaneData.components.map(async ({ id, head }) => {
        await this.componentDiff(id, head, diffOptions);
      })
    );

    return {
      newComps: this.newComps.map((id) => id.toString()),
      compsWithDiff: this.compsWithDiff,
      compsWithNoChanges: this.compsWithNoChanges.map((id) => id.toString()),
      toLaneName: this.toLaneData?.name,
    };
  }

  private async componentDiff(id: BitId, toLaneHead: Ref, diffOptions: DiffOptions) {
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    const fromLaneHead = this.fromLaneData?.components.find((c) => c.id === id)?.head || modelComponent.head;
    if (!fromLaneHead) {
      this.newComps.push(id);
      return;
    }
    if (fromLaneHead.isEqual(toLaneHead)) {
      this.compsWithNoChanges.push(id);
      return;
    }
    const fromVersion = await fromLaneHead.load(this.scope.legacyScope.objects);
    const toVersion = await toLaneHead.load(this.scope.legacyScope.objects);
    const fromLaneStr = this.fromLaneData ? this.fromLaneData.name : DEFAULT_LANE;
    diffOptions.formatDepsAsTable = false;
    const diff = await diffBetweenVersionsObjects(
      modelComponent,
      fromVersion as Version,
      toVersion as Version,
      fromLaneStr,
      this.toLaneData.name,
      this.scope.legacyScope,
      diffOptions
    );
    this.compsWithDiff.push(diff);
  }

  private getLaneNames(values: string[]): { fromLaneName?: string; toLaneName: string } {
    if (values.length > 2) {
      throw new Error(`expect "values" to include no more than two args, got ${values.length}`);
    }
    if (this.workspace) {
      const currentLane = this.workspace.getCurrentLaneId();
      if (!values.length) {
        if (currentLane.isDefault()) {
          throw new Error(`you are currently on the default branch, to run diff between lanes, please specify them`);
        }
        return { toLaneName: currentLane.name };
      }
      if (values.length === 1) {
        const fromLaneName = currentLane.isDefault() ? undefined : currentLane.name;
        return { fromLaneName, toLaneName: values[0] };
      }
      return { fromLaneName: values[0], toLaneName: values[1] };
    }
    // running from the scope
    if (values.length < 1) {
      throw new Error(`expect "values" to include at least one arg - the lane name`);
    }
    const fromLaneName = values.length === 2 ? values[0] : undefined;
    const toLaneName = values.length === 2 ? values[1] : values[0];
    return { fromLaneName, toLaneName };
  }

  private async getDefaultLaneData(ids: BitId[]): Promise<LaneData> {
    const laneData: LaneData = {
      name: DEFAULT_LANE,
      remote: null,
      components: [],
      isMerged: null,
    };

    await Promise.all(
      ids.map(async (id) => {
        const modelComponent = await this.scope.legacyScope.getModelComponent(id);
        const laneComponent = {
          id,
          head: modelComponent.head as Ref,
          version: modelComponent.latestVersion(), // should this be latestVersion() or bitId.version.toString()
        };
        laneData.components.push(laneComponent);
      })
    );

    return laneData;
  }

  private async mapToLaneData(lane: Lane): Promise<LaneData> {
    const { name, components, remoteLaneId } = lane;
    const isMerged = await lane.isFullyMerged(this.scope.legacyScope);
    return {
      name,
      isMerged,
      components: components.map((lc) => ({
        id: lc.id,
        head: lc.head,
        version: lc.id.version?.toString(),
      })),
      remote: remoteLaneId?.toString() ?? null,
    };
  }
}
