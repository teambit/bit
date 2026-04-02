import type { ScopeMain } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import type { HistoryItem, Lane, LaneHistory, Version } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { DiffResults, DiffOptions } from '@teambit/legacy.component-diff';
import { outputDiffResults } from '@teambit/legacy.component-diff';
import type { LaneId } from '@teambit/lane-id';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import type { ComponentCompareMain } from '@teambit/component-compare';
import chalk from 'chalk';
import pMap from 'p-map';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';

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
  unavailableVersions?: string[];
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

    // Build an index of fromLaneData for O(1) lookups instead of repeated O(N) .find() calls.
    const fromLaneIndex = new Map<string, Ref>();
    for (const comp of this.fromLaneData.components) {
      fromLaneIndex.set(comp.id.toStringWithoutVersion(), comp.head);
    }

    // Fork-point computation only applies when comparing a lane against main (default lane).
    // When comparing two non-default lanes, use direct head-to-head comparison.
    const useForkPoint = fromLaneId.isDefault() || toLaneId.isDefault();
    const commonSnapMap = new Map<string, { ref: Ref; id: ComponentID }>();

    if (useForkPoint) {
      // Find the common snap (merge-base / fork-point) for each component.
      // This ensures `lane diff` shows only changes made on the lane, not changes that happened on
      // main after the lane was created.
      // When a pattern is provided, only compute fork-points for the matching subset.
      const componentsToProcess = idsToCheckDiff
        ? this.toLaneData.components.filter(({ id }) => idsToCheckDiff.hasWithoutVersion(id))
        : this.toLaneData.components;
      await pMap(
        componentsToProcess,
        async ({ id, head }) => {
          if (!head) return;
          const fromHead = fromLaneIndex.get(id.toStringWithoutVersion());
          if (!fromHead || fromHead.isEqual(head)) return;
          try {
            const snapsDistance = await this.scope.getSnapsDistanceBetweenTwoSnaps(
              id,
              head.toString(),
              fromHead.toString(),
              false
            );
            if (snapsDistance?.commonSnapBeforeDiverge) {
              commonSnapMap.set(id.toStringWithoutVersion(), { ref: snapsDistance.commonSnapBeforeDiverge, id });
            }
          } catch {
            // if we can't determine the common snap, fall back to comparing against the current head
          }
        },
        { concurrency: concurrentComponentsLimit() }
      );

      // Import the common snap versions so we can diff against them
      if (commonSnapMap.size > 0) {
        const commonSnapsToImport = [...commonSnapMap.values()].map((s) => s.id.changeVersion(s.ref.hash));
        const sourceOrTargetLane = (toLane || fromLane) ?? undefined;
        await this.scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(commonSnapsToImport), {
          cache: true,
          lane: sourceOrTargetLane,
          ignoreMissingHead: true,
          reason: 'for the common snap (fork-point) of lane diff',
        });
      }
    }

    await pMap(
      this.toLaneData.components,
      async ({ id, head }) => {
        if (idsToCheckDiff && !idsToCheckDiff.hasWithoutVersion(id)) {
          return;
        }
        const idKey = id.toStringWithoutVersion();
        const forkPoint = commonSnapMap.get(idKey)?.ref;
        const fromHead = fromLaneIndex.get(idKey);
        await this.componentDiff(id, head, diffOptions, true, forkPoint, fromHead);
      },
      { concurrency: concurrentComponentsLimit() }
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

    this.ensureComponentsOnLane(lane, [...this.toLaneData.components, ...this.fromLaneData.components]);

    await this.importHistoryVersions(lane, laneId, toHistoryId, fromHistoryId);

    // Check which version objects are actually available locally.
    // Some historical versions may not exist on any remote (e.g., from snaps that were
    // superseded before export). Skip those and report them separately.
    const repo = this.scope.legacyScope.objects;
    const unavailableVersions: string[] = [];
    const fromHeadIndex = new Map<string, Ref>();
    for (const { id, head } of this.fromLaneData.components) {
      if (head) fromHeadIndex.set(id.toStringWithoutVersion(), head);
    }

    await pMap(
      this.toLaneData.components,
      async ({ id, head }) => {
        if (idsToCheckDiff && !idsToCheckDiff.hasWithoutVersion(id)) {
          return;
        }
        const fromHead = fromHeadIndex.get(id.toStringWithoutVersion());
        // check both "to" and "from" version objects exist before attempting diff
        const toMissing = head ? !(await repo.has(head)) : false;
        const fromMissing = fromHead ? !(await repo.has(fromHead)) : false;
        if (toMissing || fromMissing) {
          unavailableVersions.push(id.toStringWithoutVersion());
          return;
        }
        try {
          await this.componentDiff(id, head, {}, false, undefined, fromHead);
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err);
          this.failures.push({ id, msg: message });
        }
      },
      { concurrency: concurrentComponentsLimit() }
    );

    return {
      newCompsFrom: this.newCompsFrom.map((id) => id.toString()),
      newCompsTo: this.newCompsTo.map((id) => id.toString()),
      compsWithDiff: this.compsWithDiff,
      compsWithNoChanges: this.compsWithNoChanges.map((id) => id.toString()),
      toLaneName: this.toLaneData.name,
      fromLaneName: this.fromLaneData.name,
      failures: this.failures,
      unavailableVersions,
    };
  }

  laneDiffResultsToString(laneDiffResults: LaneDiffResults): string {
    const { compsWithDiff, newCompsFrom, newCompsTo, toLaneName, fromLaneName, failures, unavailableVersions } =
      laneDiffResults;

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

    let unavailableStr = '';
    if (unavailableVersions?.length) {
      unavailableStr = `\n\n${chalk.yellow(
        `skipped ${unavailableVersions.length} component(s) whose version objects from this history entry were not found.
this happens when snaps were created locally but the lane was later updated from the remote, replacing the local version history before export`
      )}`;
    }

    return `${diffResultsStr}${newCompsToStr}${newCompsFromStr}${failuresStr}${unavailableStr}`;
  }

  private async componentDiff(
    id: ComponentID,
    toLaneHead: Ref | null,
    diffOptions: DiffOptions = {},
    compareToHeadIfEmpty = false,
    forkPoint?: Ref,
    fromHead?: Ref
  ) {
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    const foundFromLane = fromHead ?? this.fromLaneData.components.find((c) => c.id.isEqualWithoutVersion(id))?.head;
    // Use the fork-point when available, so the diff only shows changes made on the
    // "to" lane rather than also including changes that happened on the "from" lane since the fork.
    let fromLaneHead: Ref | null | undefined = forkPoint;
    if (!fromLaneHead) {
      fromLaneHead = compareToHeadIfEmpty ? foundFromLane || modelComponent.head : foundFromLane;
    }
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

  /**
   * Import version objects needed for comparing two history entries.
   *
   * The "to" versions are typically the current lane heads (or recent snaps) and are
   * usually found locally. The "from" versions are older snaps that may not exist locally.
   *
   * Note: some historical versions may be unavailable on the remote. This happens when
   * a snap was recorded in the lane history but the Version objects were superseded by a
   * lane-merge before being exported. The export only includes versions reachable from
   * the current lane head, so orphaned pre-merge snaps are never sent to the remote.
   * Such components are skipped gracefully during the diff.
   */
  private async importHistoryVersions(lane: Lane, laneId: LaneId, toHistoryId: string, fromHistoryId: string) {
    const importer = this.scope.legacyScope.scopeImporter;

    const idsOfTo = ComponentIdList.fromArray(
      this.toLaneData.components.map((c) => c.id.changeVersion(c.head?.toString()))
    );
    const idsOfFrom = ComponentIdList.fromArray(
      this.fromLaneData.components.map((c) => c.id.changeVersion(c.head?.toString()))
    );

    await importer.importWithoutDeps(idsOfTo, {
      cache: true,
      lane,
      ignoreMissingHead: true,
      reason: `for the "to" diff - ${laneId.toString()}-${toHistoryId}`,
    });
    await importer.importWithoutDeps(idsOfFrom, {
      cache: true,
      lane,
      ignoreMissingHead: true,
      reason: `for the "from" diff - ${laneId.toString()}-${fromHistoryId}`,
    });
  }

  /**
   * Check whether a history entry's version objects are available locally (after attempting import).
   * Entries with no components (e.g. "new lane") are always considered available.
   */
  async isHistoryEntryAvailable(lane: Lane, laneHistory: LaneHistory, historyId: string): Promise<boolean> {
    const history = laneHistory.getHistory();
    const entry = history[historyId];
    if (!entry || !entry.components.length) return true;

    const laneId = lane.toLaneId();
    const laneData = this.mapHistoryToLaneData(laneId, historyId, entry);

    this.ensureComponentsOnLane(lane, laneData.components);

    const ids = ComponentIdList.fromArray(laneData.components.map((c) => c.id.changeVersion(c.head?.toString())));
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(ids, {
      cache: true,
      lane,
      ignoreMissingHead: true,
      reason: `checking availability of history entry ${historyId}`,
    });

    const repo = this.scope.legacyScope.objects;
    const headsToCheck = laneData.components.map((c) => c.head).filter((h): h is Ref => Boolean(h));
    if (!headsToCheck.length) return true;
    const existing = await repo.hasMultiple(headsToCheck);
    return existing.length === headsToCheck.length;
  }

  /**
   * Ensure all given components are recognized as part of the lane.
   * Components that existed on the lane at the time of a history entry may have since been
   * removed. Without this, the importer would fetch them from the component's own scope
   * rather than the lane's scope, which won't have the lane-specific snap objects.
   */
  private ensureComponentsOnLane(lane: Lane, components: LaneData['components']): void {
    const currentLaneCompIds = new Set(lane.components.map((c) => c.id.toStringWithoutVersion()));
    for (const comp of components) {
      const key = comp.id.toStringWithoutVersion();
      if (!currentLaneCompIds.has(key) && comp.head) {
        lane.addComponent({ id: comp.id, head: comp.head });
        currentLaneCompIds.add(key);
      }
    }
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
