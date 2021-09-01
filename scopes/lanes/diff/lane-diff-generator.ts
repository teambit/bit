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

export class LaneDiffGenerator {
  private newComps: BitId[] = [];
  private compsWithDiff: DiffResults[] = [];
  private compsWithNoChanges: BitId[] = [];
  private fromLane: Lane | null;
  private toLane: Lane;
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
    this.fromLane = fromLaneName ? await legacyScope.lanes.loadLane(new LaneId({ name: fromLaneName })) : null;
    const toLane = await legacyScope.lanes.loadLane(new LaneId({ name: toLaneName }));
    if (!toLane) {
      throw new Error(`unable to find a lane "${toLaneName}" in the scope`);
    }
    this.toLane = toLane;
    await Promise.all(
      this.toLane.components.map(async ({ id, head }) => {
        await this.componentDiff(id, head, diffOptions);
      })
    );
    return {
      newComps: this.newComps.map((id) => id.toString()),
      compsWithDiff: this.compsWithDiff,
      compsWithNoChanges: this.compsWithNoChanges.map((id) => id.toString()),
      toLaneName: toLane.name,
    };
  }

  private async componentDiff(id: BitId, toLaneHead: Ref, diffOptions: DiffOptions) {
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    const compFromLane = this.fromLane?.getComponentByName(id);
    const fromLaneHead = compFromLane ? compFromLane.head : modelComponent.head;
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
    const fromLaneStr = this.fromLane ? this.fromLane.name : DEFAULT_LANE;
    diffOptions.formatDepsAsTable = false;
    const diff = await diffBetweenVersionsObjects(
      modelComponent,
      fromVersion as Version,
      toVersion as Version,
      fromLaneStr,
      this.toLane.name,
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
}
