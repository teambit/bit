import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { HistoryItem, Ref, Lane, LaneHistory, Version } from '@teambit/scope.objects';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { DiffResults, DiffOptions, outputDiffResults } from '@teambit/legacy.component-diff';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import { ComponentCompareMain } from '@teambit/component-compare';
import chalk from 'chalk';

type LaneData = {
  name: string;
  components: Array<{
    id: ComponentID;
    head: Ref;
  }>;
  remote: string | null;
};

type Failure = { id: ComponentID; msg: string };

export type LaneDiffResults = {
  newCompsFrom: string[];
  newCompsTo: string[];
  compsWithDiff: DiffResults[];
  compsWithNoChanges: string[];
  toLaneName: string;
  fromLaneName: string;
  failures: Failure[];
};

export class LaneDiffGenerator {
  private newCompsFrom: ComponentID[] = [];
  private newCompsTo: ComponentID[] = [];
  private compsWithDiff: DiffResults[] = [];
  private compsWithNoChanges: ComponentID[] = [];
  private fromLaneData: LaneData;
  private toLaneData: LaneData;
  private failures: Failure[] = [];
  constructor(
    private workspace: Workspace | undefined,
    private scope: ScopeMain,
    private componentCompare: ComponentCompareMain
  ) {}

  /**
   * the values array may include zero to two values and will be processed as following:
   * [] => diff between the default lane (from) and the current lane (to). (only inside workspace).
   * [to] => diff between the current lane (or default-lane when in scope) and "to" lane.
   * [from, to] => diff between "from" lane and "to" lane.
   */
  async generate(values: string[], diffOptions: DiffOptions = {}, pattern?: string): Promise<LaneDiffResults> {
    const { fromLaneName, toLaneName } = this.getLaneNames(values);

    if (fromLaneName === toLaneName) {
      throw new Error(`unable to run diff between "${fromLaneName}" and "${toLaneName}", they're the same lane`);
    }
    const legacyScope = this.scope.legacyScope;
    const fromLaneId = await legacyScope.lanes.parseLaneIdFromString(fromLaneName);
    const toLaneId = await legacyScope.lanes.parseLaneIdFromString(toLaneName);
    let toLane: Lane | null | undefined;
    let fromLane: Lane | null | undefined;

    if (fromLaneId.isDefault()) {
      if (toLaneId.isDefault()) throw new Error(`unable to diff between main and main, they're the same lane`);
      toLane = await legacyScope.lanes.loadLane(toLaneId);
      if (!toLane) throw new Error(`unable to find a lane "${toLaneName}" in the scope`);
      this.toLaneData = await this.mapToLaneData(toLane);
      const bitIds = toLane.components.map((c) => c.id);
      this.fromLaneData = await this.getDefaultLaneData(bitIds);
    } else if (toLaneId.isDefault()) {
      fromLane = await legacyScope.lanes.loadLane(fromLaneId);
      if (!fromLane) throw new Error(`unable to find a lane "${fromLaneName}" in the scope`);
      this.fromLaneData = await this.mapToLaneData(fromLane);
      const bitIds = fromLane?.components.map((c) => c.id) || [];
      this.toLaneData = await this.getDefaultLaneData(bitIds);
    } else {
      // both, "from" and "to" are not default-lane.
      toLane = await legacyScope.lanes.loadLane(toLaneId);
      if (!toLane) throw new Error(`unable to find a lane "${toLaneName}" in the scope`);
      fromLane = await legacyScope.lanes.loadLane(fromLaneId);
      if (!fromLane) throw new Error(`unable to find a lane "${fromLaneName}" in the scope`);
      this.toLaneData = await this.mapToLaneData(toLane);
      this.fromLaneData = await this.mapToLaneData(fromLane);
    }

    let idsToCheckDiff: ComponentIdList | undefined;
    if (pattern) {
      const compIds = this.toLaneData.components.map((c) => c.id);
      idsToCheckDiff = ComponentIdList.fromArray(await this.scope.filterIdsFromPoolIdsByPattern(pattern, compIds));
    }

    if (!this.toLaneData.components.length) {
      throw new BitError(`lane "${toLaneName}" is empty, nothing to show`);
    }

    const idsOfTo = ComponentIdList.fromArray(
      this.toLaneData.components.map((c) => c.id.changeVersion(c.head?.toString()))
    );
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idsOfTo, {
      cache: true,
      lane: toLane || undefined,
      ignoreMissingHead: true,
      reason: `for the "to" diff - ${toLane ? toLane.name : DEFAULT_LANE}`,
    });
    const idsOfFrom = ComponentIdList.fromArray(
      this.fromLaneData.components.map((c) => c.id.changeVersion(c.head?.toString()))
    );
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idsOfFrom, {
      cache: true,
      lane: fromLane || undefined,
      ignoreMissingHead: true,
      reason: `for the "from" diff - ${fromLane ? fromLane.name : DEFAULT_LANE}`,
    });

    await Promise.all(
      this.toLaneData.components.map(async ({ id, head }) => {
        if (idsToCheckDiff && !idsToCheckDiff.hasWithoutVersion(id)) {
          return;
        }
        await this.componentDiff(id, head, diffOptions, true);
      })
    );

    return {
      newCompsFrom: this.newCompsFrom.map((id) => id.toString()),
      newCompsTo: this.newCompsTo.map((id) => id.toString()),
      compsWithDiff: this.compsWithDiff,
      compsWithNoChanges: this.compsWithNoChanges.map((id) => id.toString()),
      toLaneName: this.toLaneData.name,
      fromLaneName: this.fromLaneData.name,
      failures: this.failures,
    };
  }

  async generateDiffHistory(
    lane: Lane,
    laneHistory: LaneHistory,
    fromHistoryId: string,
    toHistoryId: string,
    pattern?: string
  ): Promise<LaneDiffResults> {
    const laneId = lane.toLaneId();
    const history = laneHistory.getHistory();
    const fromLane = history[fromHistoryId];
    const toLane = history[toHistoryId];
    if (!fromLane)
      throw new Error(`unable to find the from-history-id "${fromHistoryId}" in lane "${laneId.toString()}"`);
    if (!toLane) throw new Error(`unable to find the to-history-id "${toHistoryId}" in lane "${laneId.toString()}"`);
    this.fromLaneData = this.mapHistoryToLaneData(laneId, fromHistoryId, fromLane);
    this.toLaneData = this.mapHistoryToLaneData(laneId, toHistoryId, toLane);

    let idsToCheckDiff: ComponentIdList | undefined;
    if (pattern) {
      const compIds = this.toLaneData.components.map((c) => c.id);
      idsToCheckDiff = ComponentIdList.fromArray(await this.scope.filterIdsFromPoolIdsByPattern(pattern, compIds));
    }

    if (!this.toLaneData.components.length) {
      throw new BitError(`lane-history "${toHistoryId}" is empty, nothing to show`);
    }

    const idsOfTo = ComponentIdList.fromArray(
      this.toLaneData.components.map((c) => c.id.changeVersion(c.head?.toString()))
    );
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idsOfTo, {
      cache: true,
      lane,
      ignoreMissingHead: true,
      reason: `for the "to" diff - ${laneId.toString()}-${toHistoryId}`,
    });
    const idsOfFrom = ComponentIdList.fromArray(
      this.fromLaneData.components.map((c) => c.id.changeVersion(c.head?.toString()))
    );
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idsOfFrom, {
      cache: true,
      lane,
      ignoreMissingHead: true,
      reason: `for the "from" diff - ${laneId.toString()}-${fromHistoryId}`,
    });

    await Promise.all(
      this.toLaneData.components.map(async ({ id, head }) => {
        if (idsToCheckDiff && !idsToCheckDiff.hasWithoutVersion(id)) {
          return;
        }
        await this.componentDiff(id, head);
      })
    );

    return {
      newCompsFrom: this.newCompsFrom.map((id) => id.toString()),
      newCompsTo: this.newCompsTo.map((id) => id.toString()),
      compsWithDiff: this.compsWithDiff,
      compsWithNoChanges: this.compsWithNoChanges.map((id) => id.toString()),
      toLaneName: this.toLaneData.name,
      fromLaneName: this.fromLaneData.name,
      failures: this.failures,
    };
  }

  laneDiffResultsToString(laneDiffResults: LaneDiffResults): string {
    const { compsWithDiff, newCompsFrom, newCompsTo, toLaneName, fromLaneName, failures } = laneDiffResults;

    const newCompsOutput = (laneName: string, ids: string[]) => {
      if (!ids.length) return '';
      const newCompsIdsStr = ids.map((id) => chalk.bold(id)).join('\n');
      const newCompsTitle = `\nThe following components were introduced in ${chalk.bold(laneName)} lane`;
      return `${chalk.inverse(newCompsTitle)}\n${newCompsIdsStr}`;
    };

    const diffResultsStr = outputDiffResults(compsWithDiff);

    const failuresTitle = `\n\nDiff failed on the following component(s)`;
    const failuresIds = failures.map((f) => `${f.id.toString()} - ${chalk.red(f.msg)}`).join('\n');
    const failuresStr = failures.length ? `${chalk.inverse(failuresTitle)}\n${failuresIds}` : '';
    const newCompsToStr = newCompsOutput(toLaneName, newCompsTo);

    const newCompsFromStr = newCompsOutput(fromLaneName, newCompsFrom);
    return `${diffResultsStr}${newCompsToStr}${newCompsFromStr}${failuresStr}`;
  }

  private async componentDiff(
    id: ComponentID,
    toLaneHead: Ref | null,
    diffOptions: DiffOptions = {},
    compareToHeadIfEmpty = false
  ) {
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    const foundFromLane = this.fromLaneData.components.find((c) => c.id.isEqualWithoutVersion(id))?.head;
    const fromLaneHead = compareToHeadIfEmpty ? foundFromLane || modelComponent.head : foundFromLane;
    if (!fromLaneHead) {
      this.newCompsTo.push(id);
      return;
    }
    if (!toLaneHead) {
      this.newCompsFrom.push(id);
      return;
    }
    if (fromLaneHead.isEqual(toLaneHead)) {
      this.compsWithNoChanges.push(id);
      return;
    }
    let fromVersion: Version;
    try {
      fromVersion = await modelComponent.loadVersion(fromLaneHead.toString(), this.scope.legacyScope.objects, true);
    } catch (err: any) {
      this.failures.push({ id, msg: err.message });
      return;
    }
    const toVersion = await toLaneHead.load(this.scope.legacyScope.objects);
    const fromLaneStr = this.fromLaneData.name;
    diffOptions.formatDepsAsTable = false;
    const diff = await this.componentCompare.diffBetweenVersionsObjects(
      modelComponent,
      fromVersion,
      toVersion as Version,
      fromLaneStr,
      this.toLaneData.name,
      diffOptions
    );
    this.compsWithDiff.push(diff);
  }

  private getLaneNames(values: string[]): { fromLaneName: string; toLaneName: string } {
    if (values.length > 2) {
      throw new Error(`expect "values" to include no more than two args, got ${values.length}`);
    }
    if (this.workspace) {
      const currentLane = this.workspace.getCurrentLaneId();
      if (!values.length) {
        if (currentLane.isDefault()) {
          throw new Error(`you are currently on the default branch, to run diff between lanes, please specify them`);
        }
        return { toLaneName: currentLane.name, fromLaneName: DEFAULT_LANE };
      }
      if (values.length === 1) {
        const toLaneName = currentLane.isDefault() ? DEFAULT_LANE : currentLane.name;
        return { toLaneName, fromLaneName: values[0] };
      }
      return { toLaneName: values[1], fromLaneName: values[0] };
    }
    // running from the scope
    if (values.length < 1) {
      throw new Error(`expect "values" to include at least one arg - the lane name`);
    }
    const fromLaneName = values.length === 2 ? values[0] : DEFAULT_LANE;
    const toLaneName = values.length === 2 ? values[1] : values[0];
    return { fromLaneName, toLaneName };
  }

  private async getDefaultLaneData(ids: ComponentID[]): Promise<LaneData> {
    const laneData: LaneData = {
      name: DEFAULT_LANE,
      remote: null,
      components: [],
    };

    await Promise.all(
      ids.map(async (id) => {
        const modelComponent = await this.scope.legacyScope.getModelComponent(id);
        const laneComponent = {
          id,
          head: modelComponent.head as Ref, // @todo: this is not true. it can be undefined
          version: modelComponent.latestVersion(), // should this be latestVersion() or bitId.version.toString()
        };
        laneData.components.push(laneComponent);
      })
    );

    return laneData;
  }

  private async mapToLaneData(lane: Lane): Promise<LaneData> {
    const { name, components } = lane;
    return {
      name,
      components: components.map((lc) => ({
        id: lc.id,
        head: lc.head,
        version: lc.id.version?.toString(),
      })),
      remote: lane.toLaneId().toString(),
    };
  }

  private mapHistoryToLaneData(laneId: LaneId, historyId: string, historyItem: HistoryItem): LaneData {
    return {
      name: historyId,
      components: historyItem.components.map((compStr) => {
        const compId = ComponentID.fromString(compStr);
        return {
          id: compId.changeVersion(undefined),
          head: Ref.from(compId.version),
        };
      }),
      remote: laneId.toString(),
    };
  }
}
