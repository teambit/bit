import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import pMap from 'p-map';
import pLimit from 'p-limit';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { ExpressMain } from '@teambit/express';
import { ExpressAspect } from '@teambit/express';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError, WorkspaceAspect } from '@teambit/workspace';
import { getRemoteByName } from '@teambit/scope.remotes';
import type { LaneDiffResults } from '@teambit/lanes.modules.diff';
import { LaneDiffCmd, LaneDiffGenerator, LaneHistoryDiffCmd } from '@teambit/lanes.modules.diff';
import type { Scope as LegacyScope, TrackLane, LaneData } from '@teambit/legacy.scope';
import { NoCommonSnap } from '@teambit/legacy.scope';
import { CACHE_ROOT } from '@teambit/legacy.constants';
import path from 'path';
import { LaneId, DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { DiffOptions } from '@teambit/legacy.component-diff';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import type { MergingMain } from '@teambit/merging';
import { MergingAspect } from '@teambit/merging';
import { MergeOptions } from '@teambit/component.modules.merge-helper';
import type { ImporterMain } from '@teambit/importer';
import { FetchCmd, ImporterAspect } from '@teambit/importer';
import { ComponentIdList, ComponentID } from '@teambit/component-id';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { HistoryItem, LaneHistory, Version } from '@teambit/objects';
import { Ref, Lane } from '@teambit/objects';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import { getDivergeData } from '@teambit/component.snap-distance';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { compact } from 'lodash';
import type { ComponentCompareMain } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import type { ComponentWriterMain } from '@teambit/component-writer';
import { ComponentWriterAspect } from '@teambit/component-writer';
import type { RemoveMain } from '@teambit/remove';
import { RemoveAspect } from '@teambit/remove';
import type { CheckoutMain } from '@teambit/checkout';
import { CheckoutAspect } from '@teambit/checkout';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import type { ComponentsList } from '@teambit/legacy.component-list';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import fs from 'fs-extra';
import execa from 'execa';
import { getGitExecutablePath } from '@teambit/git.modules.git-executable';
import { removeLanes } from './remove-lanes';
import { LanesAspect } from './lanes.aspect';
import type { LaneCheckoutOpts } from './lane.cmd';
import {
  LaneCmd,
  LaneCreateCmd,
  LaneCurrentCmd,
  LaneImportCmd,
  LaneListCmd,
  LaneRemoveCmd,
  LaneShowCmd,
  LaneChangeScopeCmd,
  LaneAliasCmd,
  LaneRenameCmd,
  LaneRemoveReadmeCmd,
  LaneRemoveCompCmd,
  CatLaneHistoryCmd,
  LaneHistoryCmd,
  LaneCheckoutCmd,
  LaneRevertCmd,
  LaneFetchCmd,
  LaneEjectCmd,
} from './lane.cmd';
import { lanesSchema } from './lanes.graphql';
import { SwitchCmd } from './switch.cmd';
import { LaneSwitcher } from './switch-lanes';
import { createLane, createLaneInScope, throwForInvalidLaneName } from '@teambit/lanes.modules.create-lane';
import { LanesCreateRoute } from './lanes.create.route';
import { LanesDeleteRoute } from './lanes.delete.route';
import { LanesRestoreRoute } from './lanes.restore.route';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';

export { Lane };

export type SnapsDistanceObj = {
  onSource: string[];
  onTarget: string[];
  common?: string;
};

export type LaneResults = {
  lanes: LaneData[];
  currentLane?: string | null;
};

export type CreateLaneOptions = {
  scope?: string; // default to the defaultScope in workspace.jsonc
  alias?: string; // default to the remote name
  forkLaneNewScope?: boolean;
};

export type SwitchLaneOptions = {
  skipFetch?: boolean;
  alias?: string;
  merge?: MergeStrategy;
  forceOurs?: boolean;
  forceTheirs?: boolean;
  workspaceOnly?: boolean;
  pattern?: string;
  skipDependencyInstallation?: boolean;
  verbose?: boolean;
  override?: boolean;
  branch?: boolean;
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
  snapsDistance?: SnapsDistanceObj;
  unrelated?: boolean;
  /**
   * internal context for deferred derivation of `changes`. not exposed on the GraphQL schema —
   * the `changes` field resolver consumes this via `deriveComponentChanges` so the heavy
   * `componentCompare.compare()` + `getAPIDiff()` work only runs when the field is selected,
   * lazily per-component, in parallel via graphql-js list resolution.
   */
  changesContext?: {
    commonSnap?: { hash: string } | null;
    skipped?: boolean;
    pending?: Promise<ChangeType[] | undefined>;
  };
};

export type LaneDiffStatusOptions = {
  /** skip importing the common snaps and computing `changes` entirely */
  skipChanges?: boolean;
  /**
   * drop components where the snaps-distance says the source already includes everything on the
   * target. these contribute nothing to a target→source merge view but each costs an
   * `importWithoutDeps` round trip + an `apiDiff` schema extraction.
   */
  skipUpToDate?: boolean;
  /**
   * still classify snap distance, but don't compute `changes` eagerly. callers derive them lazily
   * via `deriveComponentChanges` (used by GraphQL field resolvers).
   */
  deferChanges?: boolean;
};

type SerializedSnapsDistance = {
  unrelated?: boolean;
  isUpToDate: boolean;
  commonSnapHash?: string;
  snapsOnSourceHashes: string[];
  snapsOnTargetHashes: string[];
};

type SerializedComponentStatus = {
  componentIdStr: string;
  sourceHead: string;
  targetHead?: string;
  changes?: ChangeType[];
  changeType?: ChangeType;
  upToDate?: boolean;
  unrelated?: boolean;
  snapsDistance?: SnapsDistanceObj;
};

export type DivergeDataPerId = { id: ComponentID; divergeData: SnapsDistance };

export type LaneDiffStatus = {
  source: LaneId;
  target: LaneId;
  componentsStatus: LaneComponentDiffStatus[];
};

export type MarkRemoveOnLaneResult = { removedFromWs: ComponentID[]; markedRemoved: ComponentID[] };

export type CreateLaneResult = {
  lane: Lane;
  laneId: LaneId;
  hash: string;
  alias?: string;
};

export class LanesMain {
  constructor(
    readonly workspace: Workspace | undefined,
    private scope: ScopeMain,
    private merging: MergingMain,
    private componentAspect: ComponentMain,
    public logger: Logger,
    readonly importer: ImporterMain,
    private exporter: ExportMain,
    private componentCompare: ComponentCompareMain,
    readonly componentWriter: ComponentWriterMain,
    private remove: RemoveMain,
    readonly checkout: CheckoutMain,
    private install: InstallMain
  ) {
    this.loadSnapsDistanceMemoFromDisk();
    this.loadApiDiffMemoFromDisk();
    this.loadChangeTypesMemoFromDisk();
    this.loadDiffStatusMemoFromDisk();
  }

  /**
   * Snap distance is purely a function of (componentId, sourceHead, targetHead) — all immutable
   * hashes — so it's safe to memoize indefinitely. Persisted to disk so the *first* lane-diff call
   * after a server start hits a warm cache (cold compute is the dominant latency: ~1.1s for 30
   * components walking the snap graph + cold imports). LRU-bounded to keep the file small.
   */
  private snapsDistanceMemo = new Map<string, SerializedSnapsDistance>();
  private snapsDistanceMemoDirty = false;
  private snapsDistanceMemoSaveTimer: NodeJS.Timeout | undefined;
  private static SNAPS_DISTANCE_MEMO_MAX = 5000;
  private static SNAPS_DISTANCE_MEMO_FILE = path.join(CACHE_ROOT, 'lane-diff-snaps-distance.json');

  /**
   * Memo for API-diff `hasChanges` per `(baseId, compareId)` pair. Schema extraction is the single
   * most expensive per-component step (cold ~5–15s per component) — but its `hasChanges` result is
   * deterministic on the immutable hashes, so we persist it to disk like the snaps-distance memo.
   * On the wire we only consume `apiDiff?.hasChanges`, so caching just that boolean keeps the file
   * tiny and makes the disk-warm path constant-time.
   */
  private apiDiffMemo = new Map<string, boolean>();
  private apiDiffInflight = new Map<string, Promise<boolean>>();
  /**
   * Bound the parallelism of `deriveChangeTypes` across all in-flight requests. With graphql-js
   * resolving list fields in parallel via `Promise.all`, an uncapped deferred derivation can fire
   * dozens of `componentCompare.compare` + `getAPIDiff` calls at once, all hitting the same single
   * TypeScript service worker — which serializes them anyway and degrades sharply under load. A
   * small cap matches the service's effective concurrency and prevents thundering-herd.
   */
  private deriveChangesLimit = pLimit(4);

  /**
   * Disk-persisted memo for the final `ChangeType[]` array per `(componentId, sourceHead, commonSnapHash)`.
   * Keyed on immutable hashes — deterministic forever. With this populated, a cold server start can
   * answer `lanes.diffStatus` without ever invoking `componentCompare.compare` or `getAPIDiff` —
   * the per-component schema-extraction cost goes from seconds to a Map.get().
   */
  private changeTypesMemo = new Map<string, ChangeType[]>();
  private changeTypesInflight = new Map<string, Promise<ChangeType[]>>();
  private changeTypesMemoDirty = false;
  private changeTypesMemoSaveTimer: NodeJS.Timeout | undefined;
  private static CHANGE_TYPES_MEMO_MAX = 5000;
  private static CHANGE_TYPES_MEMO_FILE = path.join(CACHE_ROOT, 'lane-diff-change-types.json');

  private async loadChangeTypesMemoFromDisk() {
    try {
      const raw = await fs.readFile(LanesMain.CHANGE_TYPES_MEMO_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, ChangeType[]>;
      for (const [k, v] of Object.entries(parsed)) this.changeTypesMemo.set(k, v);
      this.logger?.debug(`[lane-diff memo] loaded ${this.changeTypesMemo.size} change-types entries`);
    } catch {
      // first run / corrupted file.
    }
  }

  private scheduleChangeTypesMemoSave() {
    this.changeTypesMemoDirty = true;
    if (this.changeTypesMemoSaveTimer) return;
    this.changeTypesMemoSaveTimer = setTimeout(() => {
      this.changeTypesMemoSaveTimer = undefined;
      if (!this.changeTypesMemoDirty) return;
      this.changeTypesMemoDirty = false;
      const serialized: Record<string, ChangeType[]> = {};
      for (const [k, v] of this.changeTypesMemo) serialized[k] = v;
      fs.outputFile(LanesMain.CHANGE_TYPES_MEMO_FILE, JSON.stringify(serialized)).catch(() => {});
    }, 500);
  }

  private memoStoreChangeTypes(key: string, changes: ChangeType[]) {
    if (this.changeTypesMemo.size >= LanesMain.CHANGE_TYPES_MEMO_MAX) {
      const firstKey = this.changeTypesMemo.keys().next().value;
      if (firstKey) this.changeTypesMemo.delete(firstKey);
    }
    this.changeTypesMemo.set(key, changes);
    this.scheduleChangeTypesMemoSave();
  }

  private changeTypesMemoKey(componentId: ComponentID, sourceHead: string, commonHash: string | null | undefined) {
    return `${componentId.toStringWithoutVersion()}|${sourceHead}|${commonHash ?? ''}`;
  }

  /**
   * Top-level result memo: the entire `LaneDiffStatus.componentsStatus` array keyed on the lane
   * head hashes + relevant options. With this populated, a cold server start that receives a
   * lane-diff request for an unchanged pair of lanes answers from disk in a single `Map.get()`,
   * skipping `importObjectsFromMainIfExist`, per-component object loads, and all derivation.
   * Invalidated implicitly when either lane head moves — the key embeds both hashes.
   */
  private diffStatusResultMemo = new Map<string, SerializedComponentStatus[]>();
  private diffStatusMemoDirty = false;
  private diffStatusMemoSaveTimer: NodeJS.Timeout | undefined;
  private static DIFF_STATUS_MEMO_MAX = 200;
  private static DIFF_STATUS_MEMO_FILE = path.join(CACHE_ROOT, 'lane-diff-results.json');

  private async loadDiffStatusMemoFromDisk() {
    try {
      const raw = await fs.readFile(LanesMain.DIFF_STATUS_MEMO_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, SerializedComponentStatus[]>;
      for (const [k, v] of Object.entries(parsed)) this.diffStatusResultMemo.set(k, v);
      this.logger?.debug(`[lane-diff memo] loaded ${this.diffStatusResultMemo.size} diff-status entries`);
    } catch {
      // first run / corrupted file.
    }
  }

  private scheduleDiffStatusMemoSave() {
    this.diffStatusMemoDirty = true;
    if (this.diffStatusMemoSaveTimer) return;
    this.diffStatusMemoSaveTimer = setTimeout(() => {
      this.diffStatusMemoSaveTimer = undefined;
      if (!this.diffStatusMemoDirty) return;
      this.diffStatusMemoDirty = false;
      const serialized: Record<string, SerializedComponentStatus[]> = {};
      for (const [k, v] of this.diffStatusResultMemo) serialized[k] = v;
      fs.outputFile(LanesMain.DIFF_STATUS_MEMO_FILE, JSON.stringify(serialized)).catch(() => {});
    }, 500);
  }

  private memoStoreDiffStatus(key: string, statuses: LaneComponentDiffStatus[]) {
    if (this.diffStatusResultMemo.size >= LanesMain.DIFF_STATUS_MEMO_MAX) {
      const firstKey = this.diffStatusResultMemo.keys().next().value;
      if (firstKey) this.diffStatusResultMemo.delete(firstKey);
    }
    this.diffStatusResultMemo.set(
      key,
      statuses.map((s) => ({
        componentIdStr: s.componentId.toString(),
        sourceHead: s.sourceHead,
        targetHead: s.targetHead,
        changes: s.changes,
        changeType: s.changeType,
        upToDate: s.upToDate,
        unrelated: s.unrelated,
        snapsDistance: s.snapsDistance,
      }))
    );
    this.scheduleDiffStatusMemoSave();
  }

  private diffStatusFromMemo(serialized: SerializedComponentStatus[]): LaneComponentDiffStatus[] {
    return serialized.map((s) => ({
      componentId: ComponentID.fromString(s.componentIdStr),
      sourceHead: s.sourceHead,
      targetHead: s.targetHead,
      changes: s.changes,
      changeType: s.changeType,
      upToDate: s.upToDate,
      unrelated: s.unrelated,
      snapsDistance: s.snapsDistance,
    }));
  }

  /**
   * Build the top-level result memo key. Key on the lane head hashes — they move with every snap,
   * so this implicitly invalidates whenever the lane composition changes. Returns empty string if
   * the source lane has no head hash to key on (avoid caching incomplete state).
   */
  private diffStatusResultMemoKey(
    sourceLaneId: LaneId,
    sourceLane: any,
    targetLaneId: LaneId | undefined,
    targetLane: any,
    options?: LaneDiffStatusOptions
  ): string {
    const sourceHeadHash = sourceLane?.hash?.toString?.() ?? sourceLane?.hash ?? '';
    if (!sourceHeadHash) return '';
    const targetHeadHash = targetLane?.hash?.toString?.() ?? targetLane?.hash ?? (targetLaneId ? '' : 'default');
    const optionsKey = `${options?.skipChanges ? '1' : '0'}${options?.skipUpToDate ? '1' : '0'}`;
    return `${sourceLaneId.toString()}@${sourceHeadHash}|${targetLaneId?.toString() ?? 'default'}@${targetHeadHash}|${optionsKey}`;
  }

  private tryDiffStatusResultMemo(
    resultMemoKey: string,
    sourceLaneId: LaneId,
    targetLaneId: LaneId | undefined
  ): LaneDiffStatus | undefined {
    if (!resultMemoKey) return undefined;
    const cached = this.diffStatusResultMemo.get(resultMemoKey);
    if (!cached) return undefined;
    return {
      source: sourceLaneId,
      target: targetLaneId || this.getDefaultLaneId(),
      componentsStatus: this.diffStatusFromMemo(cached),
    };
  }

  /**
   * Pre-warm the downstream caches the lane-compare UI hits right after `LaneDiffStatus`:
   * - the scope's `ScopeComponentLoader.componentsCache` via `host.getMany([…])`
   * - `componentCompare`'s disk-persisted result memo via `compareComponents(pairs)`
   *
   * Fire-and-forget. The UI's follow-up `Component` and `CompareComponents` queries arrive ~50–200 ms
   * after we return; this kickoff happens *before* we return, so the work overlaps the UI's render
   * tick and the response serialization. By the time the UI's queries land on the server, the caches
   * are populated (or, worst case, the pre-warm work is in-flight and the resolver-level single-flight
   * in `componentCompare` dedupes the load).
   */
  private prewarmCompareCaches(
    host: any,
    visibleDiffProps: Array<{ componentId: ComponentID; sourceHead: string; targetHead?: string }>
  ) {
    const allVersionedIds: ComponentID[] = [];
    const comparePairs: Array<{ baseId: string; compareId: string }> = [];
    for (const { componentId, sourceHead, targetHead } of visibleDiffProps) {
      const compareId = componentId.changeVersion(sourceHead);
      allVersionedIds.push(compareId);
      if (targetHead) {
        const baseId = componentId.changeVersion(targetHead);
        allVersionedIds.push(baseId);
        comparePairs.push({ baseId: baseId.toString(), compareId: compareId.toString() });
      }
    }
    if (allVersionedIds.length === 0) return;
    // NOTE: `host.getMany` uses mapSeries internally (sequential). For cold pre-warm to actually
    // beat the UI's concurrent N-op `Component` batch we have to drive parallelism ourselves. pMap
    // here uses the same `concurrentComponentsLimit()` cap as the lane diff body, matching what
    // downstream loaders are tuned for.
    Promise.all([
      // wrap in try/catch since `host.get` could be missing or throw synchronously; the previous
      // `host.get?.(id).catch(...)` chained .catch on `undefined` when get was absent.
      pMap(
        allVersionedIds,
        async (id) => {
          try {
            return await host.get?.(id);
          } catch {
            return undefined;
          }
        },
        { concurrency: concurrentComponentsLimit() }
      ).catch(() => undefined),
      comparePairs.length > 0
        ? this.componentCompare.compareComponents(comparePairs).catch(() => undefined)
        : Promise.resolve(),
    ]).catch(() => {});
  }

  private populateDiffStatusMemoAsync(resultMemoKey: string, results: LaneComponentDiffStatus[]) {
    Promise.all(
      results.map(async (status) => {
        if (status.changes) return;
        status.changes = await this.deriveComponentChanges(status);
      })
    )
      .then(() => this.memoStoreDiffStatus(resultMemoKey, results))
      .catch(() => {});
  }
  private apiDiffMemoDirty = false;
  private apiDiffMemoSaveTimer: NodeJS.Timeout | undefined;
  private static API_DIFF_MEMO_MAX = 5000;
  private static API_DIFF_MEMO_FILE = path.join(CACHE_ROOT, 'lane-diff-api-diff.json');

  private async loadApiDiffMemoFromDisk() {
    try {
      const raw = await fs.readFile(LanesMain.API_DIFF_MEMO_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      for (const [k, v] of Object.entries(parsed)) this.apiDiffMemo.set(k, v);
      this.logger?.debug(`[lane-diff memo] loaded ${this.apiDiffMemo.size} api-diff entries`);
    } catch {
      // first run / corrupted file.
    }
  }

  private scheduleApiDiffMemoSave() {
    this.apiDiffMemoDirty = true;
    if (this.apiDiffMemoSaveTimer) return;
    this.apiDiffMemoSaveTimer = setTimeout(() => {
      this.apiDiffMemoSaveTimer = undefined;
      if (!this.apiDiffMemoDirty) return;
      this.apiDiffMemoDirty = false;
      const serialized: Record<string, boolean> = {};
      for (const [k, v] of this.apiDiffMemo) serialized[k] = v;
      fs.outputFile(LanesMain.API_DIFF_MEMO_FILE, JSON.stringify(serialized)).catch(() => {});
    }, 500);
  }

  private memoStoreApiDiff(key: string, hasChanges: boolean) {
    if (this.apiDiffMemo.size >= LanesMain.API_DIFF_MEMO_MAX) {
      const firstKey = this.apiDiffMemo.keys().next().value;
      if (firstKey) this.apiDiffMemo.delete(firstKey);
    }
    this.apiDiffMemo.set(key, hasChanges);
    this.scheduleApiDiffMemoSave();
  }

  private snapsDistanceMemoKey(componentId: ComponentID, sourceHead: string, targetHead?: string) {
    return `${componentId.toStringWithoutVersion()}|${sourceHead}|${targetHead || ''}`;
  }

  private async loadSnapsDistanceMemoFromDisk() {
    try {
      const raw = await fs.readFile(LanesMain.SNAPS_DISTANCE_MEMO_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, SerializedSnapsDistance>;
      for (const [k, v] of Object.entries(parsed)) {
        this.snapsDistanceMemo.set(k, v);
      }
      this.logger?.debug(
        `[lane-diff memo] loaded ${this.snapsDistanceMemo.size} entries from ${LanesMain.SNAPS_DISTANCE_MEMO_FILE}`
      );
    } catch {
      // first run / corrupted file: start empty.
    }
  }

  private scheduleSnapsDistanceMemoSave() {
    this.snapsDistanceMemoDirty = true;
    if (this.snapsDistanceMemoSaveTimer) return;
    this.snapsDistanceMemoSaveTimer = setTimeout(() => {
      this.snapsDistanceMemoSaveTimer = undefined;
      if (!this.snapsDistanceMemoDirty) return;
      this.snapsDistanceMemoDirty = false;
      const serialized: Record<string, SerializedSnapsDistance> = {};
      for (const [k, v] of this.snapsDistanceMemo) serialized[k] = v;
      fs.outputFile(LanesMain.SNAPS_DISTANCE_MEMO_FILE, JSON.stringify(serialized)).catch(() => {
        // best-effort cache; log nothing — disk failure shouldn't be user-visible noise.
      });
    }, 500);
  }

  private memoStoreSnapsDistance(key: string, snapsDistance: SnapsDistance) {
    if (this.snapsDistanceMemo.size >= LanesMain.SNAPS_DISTANCE_MEMO_MAX) {
      const firstKey = this.snapsDistanceMemo.keys().next().value;
      if (firstKey) this.snapsDistanceMemo.delete(firstKey);
    }
    this.snapsDistanceMemo.set(key, {
      unrelated: snapsDistance.err instanceof NoCommonSnap,
      isUpToDate: !!snapsDistance.isUpToDate?.(),
      commonSnapHash: snapsDistance.commonSnapBeforeDiverge?.hash,
      snapsOnSourceHashes: (snapsDistance.snapsOnSourceOnly ?? []).map((s) => s.hash),
      snapsOnTargetHashes: (snapsDistance.snapsOnTargetOnly ?? []).map((s) => s.hash),
    });
    this.scheduleSnapsDistanceMemoSave();
  }

  /**
   * Reconstruct a duck-typed SnapsDistance from the serialized form for downstream consumers.
   * Consumers only touch `.err`, `.isUpToDate()`, `.commonSnapBeforeDiverge.hash`,
   * `.snapsOnSourceOnly.[].hash`, `.snapsOnTargetOnly.[].hash` — so a plain object suffices.
   */
  private snapsDistanceFromMemo(s: SerializedSnapsDistance, componentIdStr: string): SnapsDistance {
    return {
      err: s.unrelated ? new NoCommonSnap(componentIdStr) : undefined,
      isUpToDate: () => s.isUpToDate,
      commonSnapBeforeDiverge: s.commonSnapHash ? { hash: s.commonSnapHash } : null,
      snapsOnSourceOnly: s.snapsOnSourceHashes.map((h) => ({ hash: h })),
      snapsOnTargetOnly: s.snapsOnTargetHashes.map((h) => ({ hash: h })),
    } as unknown as SnapsDistance;
  }

  /**
   * return the lane data without the deleted components.
   * the deleted components are filtered out in legacyScope.lanes.getLanesData()
   */
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
    if (!this.scope) throw new Error(`error: please run the command from a workspace or a scope directory`);
    if (remote) {
      const laneId = name ? LaneId.from(name, remote) : undefined;
      const remoteObj = await getRemoteByName(remote, consumer);
      const lanes = await remoteObj.listLanes(laneId?.toString(), showMergeData);
      // if the remote is http, it eventually calls this method from the remote without the "remote" param.
      // again, the deleted components are filtered out.
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

  async parseLaneId(idStr: string): Promise<LaneId> {
    const scope: LegacyScope = this.scope.legacyScope;
    return scope.lanes.parseLaneIdFromString(idStr);
  }

  async getLaneHistory(laneId: LaneId): Promise<LaneHistory> {
    const lane = await this.loadLane(laneId);
    if (!lane) throw new BitError(`unable to find a lane "${laneId.toString()}"`);
    const laneHistory = await this.scope.legacyScope.lanes.getOrCreateLaneHistory(lane);
    return laneHistory;
  }

  async checkoutHistory(historyId: string, options?: LaneCheckoutOpts) {
    const historyItem = await this.getHistoryItemOfCurrentLane(historyId);
    const ids = historyItem.components.map((id) => ComponentID.fromString(id));
    const lane = await this.getCurrentLane();
    const results = await this.checkout.checkout({
      ids: ids.map((id) => id.changeVersion(undefined)),
      versionPerId: ids,
      allowAddingComponentsFromScope: true,
      skipNpmInstall: options?.skipDependencyInstallation,
      isLane: true,
      lane,
    });
    return results;
  }

  async revertHistory(historyId: string, options?: LaneCheckoutOpts) {
    const historyItem = await this.getHistoryItemOfCurrentLane(historyId);
    const lane = await this.getCurrentLane();

    const historyComponentIds = historyItem.components.map((id) => ComponentID.fromString(id));

    // When restoreDeletedComponents is set, we need to identify which components from the history
    // are currently not in the workspace (i.e., were deleted after that history point)
    let existingIds = historyComponentIds;
    let deletedIds: ComponentID[] = [];

    if (options?.restoreDeletedComponents) {
      const currentBitmap = this.workspace?.consumer.bitMap.getAllBitIdsFromAllLanes() || [];
      const currentComponentIdsSet = new Set(currentBitmap.map((id) => id.toStringWithoutVersion()));

      existingIds = historyComponentIds.filter((id) => currentComponentIdsSet.has(id.toStringWithoutVersion()));
      deletedIds = historyComponentIds.filter((id) => !currentComponentIdsSet.has(id.toStringWithoutVersion()));
    }

    // First, revert the existing components (keeps bitmap versions)
    const results = await this.checkout.checkout({
      ids: existingIds.map((id) => id.changeVersion(undefined)),
      versionPerId: existingIds,
      allowAddingComponentsFromScope: true,
      revert: true,
      skipNpmInstall: options?.skipDependencyInstallation,
      isLane: true,
      lane,
    });

    // If there are deleted components to restore, checkout them separately (updates bitmap)
    if (deletedIds.length > 0) {
      const deletedResults = await this.checkout.checkout({
        ids: deletedIds.map((id) => id.changeVersion(undefined)),
        versionPerId: deletedIds,
        allowAddingComponentsFromScope: true,
        revert: false, // Don't use revert mode for deleted components - we want to update bitmap
        skipNpmInstall: options?.skipDependencyInstallation,
        isLane: true,
        lane,
      });

      // Merge the results
      results.components = [...(results.components || []), ...(deletedResults.components || [])];
      results.addedComponents = [...(results.addedComponents || []), ...(deletedResults.addedComponents || [])];
    }

    return results;
  }

  private async getHistoryItemOfCurrentLane(historyId: string): Promise<HistoryItem> {
    const laneId = this.getCurrentLaneId();
    if (!laneId || laneId.isDefault()) {
      throw new BitError(`unable to checkout history "${historyId}" while on main`);
    }
    await this.importLaneHistory(laneId);
    const laneHistory = await this.getLaneHistory(laneId);
    const history = laneHistory.getHistory();
    const historyItem = history[historyId];
    if (!historyItem) {
      throw new BitError(`unable to find history "${historyId}" in lane "${laneId.toString()}"`);
    }
    return historyItem;
  }

  async importLaneHistory(laneId: LaneId) {
    const existingLane = await this.loadLane(laneId);
    if (existingLane?.isNew) return;
    await this.importer.importLaneObject(laneId, undefined, true);
  }

  async isLaneExistsOnRemote(laneId: LaneId): Promise<boolean> {
    const results = await this.scope.legacyScope.scopeImporter.importLanes([laneId]);
    return results.length > 0;
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
  async getCurrentLane(): Promise<Lane | undefined> {
    const laneId = this.getCurrentLaneId();
    if (!laneId || laneId.isDefault()) return undefined;
    return this.loadLane(laneId);
  }

  getDefaultLaneId(): LaneId {
    return LaneId.from(DEFAULT_LANE, this.scope.name);
  }

  setCurrentLane(laneId: LaneId, alias?: string, exported?: boolean) {
    this.workspace?.consumer.setCurrentLane(laneId, exported);
  }

  async createLane(
    name: string,
    { scope, alias, forkLaneNewScope }: CreateLaneOptions = {}
  ): Promise<CreateLaneResult> {
    if (!this.workspace) {
      const newLane = await createLaneInScope(name, this.scope);
      return {
        lane: newLane,
        laneId: newLane.toLaneId(),
        hash: newLane.hash().toString(),
      };
    }
    if (alias) {
      throwForInvalidLaneName(alias);
    }
    const currentLaneId = this.workspace.getCurrentLaneId();
    const currentLaneScope = currentLaneId.isDefault() ? undefined : currentLaneId.scope;
    if (!forkLaneNewScope && !currentLaneId.isDefault() && scope && currentLaneScope !== scope) {
      throw new BitError(`you're about to create a lane forked from ${currentLaneId.toString()} and assign it to a different scope "${scope}".
if the lane components have a large history, it would be best to stick with the same scope as the current lane.
to do that, re-run the command without the "--scope" flag. it will create the lane and set the scope to "${currentLaneScope}"
if you wish to keep ${scope} scope, please re-run the command with "--fork-lane-new-scope" flag.`);
    }
    scope = scope || (currentLaneId.isDefault() ? this.workspace.defaultScope : currentLaneId.scope);
    const laneObj = await createLane(this.workspace, name, scope);
    const laneId = LaneId.from(name, scope);
    this.setCurrentLane(laneId, alias, false);
    const trackLaneData = {
      localLane: alias || name,
      remoteLane: name,
      remoteScope: scope,
    };
    this.scope.legacyScope.lanes.trackLane(trackLaneData);
    this.scope.legacyScope.scopeJson.setLaneAsNew(name);
    await this.workspace.consumer.onDestroy('lane-create');

    const results = {
      lane: laneObj,
      alias,
      laneId: laneObj.toLaneId(),
      hash: laneObj.hash().toString(),
    };
    return results;
  }

  async loadLane(id: LaneId): Promise<Lane | undefined> {
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
    await this.workspace.consumer.onDestroy('lane-track');

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
    await this.workspace.consumer.onDestroy('lane-alias');

    return { laneId };
  }

  async changeScope(remoteScope: string, laneName?: string): Promise<{ remoteScopeBefore: string; localName: string }> {
    if (!this.workspace) {
      throw new BitError(`unable to change-scope of a lane outside of Bit workspace`);
    }
    let laneId: LaneId;
    let laneNameWithoutScope: string;
    if (laneName) {
      laneNameWithoutScope = laneName.includes(LANE_REMOTE_DELIMITER)
        ? laneName.split(LANE_REMOTE_DELIMITER)[1]
        : laneName;
      laneId = await this.scope.legacyScope.lanes.parseLaneIdFromString(laneName);
    } else {
      laneId = this.workspace.getCurrentLaneId();
      laneNameWithoutScope = laneId.name;
    }
    const lane = await this.loadLane(laneId);
    if (!lane) {
      throw new BitError(`unable to find a local lane "${laneName}"`);
    }
    if (!lane.isNew) {
      throw new BitError(`changing lane scope-name is allowed for new lanes only. this lane has been exported already.
please create a new lane instead, which will include all components of this lane`);
    }
    if (!isValidScopeName(remoteScope)) {
      throw new InvalidScopeName(remoteScope);
    }
    const remoteScopeBefore = lane.scope;
    lane.changeScope(remoteScope);
    const newLaneId = LaneId.from(laneId.name, remoteScope);
    const trackData = {
      localLane: laneNameWithoutScope,
      remoteLane: laneId.name,
      remoteScope,
    };
    this.scope.legacyScope.lanes.trackLane(trackData);
    await this.scope.legacyScope.lanes.saveLane(lane, {
      laneHistoryMsg: `change scope from ${remoteScopeBefore} to ${remoteScope}`,
    });
    this.workspace.consumer.bitMap.setCurrentLane(newLaneId, false);
    await this.workspace.consumer.onDestroy('lane-scope-change');

    return { remoteScopeBefore, localName: laneNameWithoutScope };
  }

  /**
   * change a lane-name and if possible, export the lane to the remote
   */
  async rename(newName: string, laneName?: string): Promise<{ currentName: string }> {
    if (!this.workspace) {
      throw new BitError(`unable to rename a lane outside of Bit workspace`);
    }
    throwForInvalidLaneName(newName);
    const currentName = laneName || this.workspace.getCurrentLaneId().name;
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

    // change scope.json related data and change the lane object
    await this.scope.legacyScope.lanes.renameLane(lane, newName);

    // change current-lane if needed
    const currentLaneId = this.getCurrentLaneId();
    if (currentLaneId?.isEqual(laneId)) {
      const newLaneId = LaneId.from(newName, lane.scope);
      const isExported = this.workspace.consumer.bitMap.isLaneExported;
      this.setCurrentLane(newLaneId, undefined, isExported);
    }

    // this writes the changes done on scope.json file (along with .bitmap)
    await this.workspace.consumer.onDestroy('lane-rename');

    return { currentName };
  }

  async exportLane(lane: Lane) {
    await this.exporter.pushToScopes({
      scope: this.scope.legacyScope,
      laneObject: lane,
      ids: new ComponentIdList(),
      allVersions: false,
    });
  }

  async importLaneObject(laneId: LaneId, persistIfNotExists = true, includeLaneHistory = false): Promise<Lane> {
    return this.importer.importLaneObject(laneId, persistIfNotExists, includeLaneHistory);
  }

  async eject(pattern: string): Promise<ComponentID[]> {
    if (!this.workspace) {
      throw new BitError(`unable to eject a component outside of Bit workspace`);
    }
    const ids = await this.workspace.idsByPattern(pattern);
    await Promise.all(
      ids.map(async (id) => {
        const modelComp = await this.scope.getBitObjectModelComponent(id, true);
        if (!modelComp!.head) {
          throw new BitError(`unable to eject "${id.toString()}" as it has no main version`);
        }
      })
    );

    const deletedComps = await this.remove.deleteComps(pattern);
    const packages = deletedComps.map((c) => c.getPackageName());
    await this.install.install(packages);
    return deletedComps.map((c) => c.id);
  }

  /**
   * get the head hash (snap) of main. return undefined if the component exists only on a lane and was never merged to main
   */
  async getHeadOnMain(componentId: ComponentID): Promise<string | undefined> {
    const modelComponent = await this.scope.legacyScope.getModelComponent(componentId);
    return modelComponent.head?.toString();
  }

  /**
   * fetch the lane object and its components from the remote.
   * save the objects and the lane to the local scope.
   * this method doesn't change anything in the workspace.
   */
  async fetchLaneWithItsComponents(laneId: LaneId): Promise<Lane> {
    this.logger.debug(`fetching lane ${laneId.toString()}`);
    const lane = await this.importer.importLaneObject(laneId);
    if (!lane) throw new Error(`unable to import lane ${laneId.toString()} from the remote`);

    await this.importer.fetchLaneComponents(lane);
    this.logger.debug(`fetching lane ${laneId.toString()} done, fetched ${lane.components.length} components`);
    return lane;
  }

  async removeLanes(laneNames: string[], opts?: { remote: boolean; force: boolean }): Promise<string[]> {
    if (!this.workspace && !opts?.remote) {
      await this.scope.legacyScope.lanes.removeLanes(this.scope.legacyScope, laneNames, true);
      return laneNames;
    }
    const results = await removeLanes(this.workspace?.consumer, laneNames, !!opts?.remote, !!opts?.force);
    if (this.workspace) await this.workspace.consumer.onDestroy('lane-remove');

    return results.laneResults;
  }

  /**
   * when deleting a lane object, it is sent into the "trash" directory in the scope.
   * this method restores it and put it back in the "objects" directory.
   * as an argument, it needs a hash. the reason for not supporting lane-id is because the trash may have multiple
   * lanes with the same lane-id but different hashes.
   */
  async restoreLane(laneHash: string) {
    const ref = Ref.from(laneHash);
    const objectsFromTrash = (await this.scope.legacyScope.objects.getFromTrash([ref])) as Lane[];
    const laneIdFromTrash = objectsFromTrash[0].toLaneId();
    const existingWithSameId = await this.loadLane(laneIdFromTrash);
    if (existingWithSameId) {
      if (existingWithSameId.hash().isEqual(ref)) {
        throw new BitError(`unable to restore lane ${laneIdFromTrash.toString()}, as it already exists`);
      }
      throw new BitError(
        `unable to restore lane ${laneIdFromTrash.toString()}, as a lane with the same id already exists`
      );
    }
    await this.scope.legacyScope.objects.restoreFromTrash([ref]);
  }

  /**
   * switch to a different local or remote lane.
   * switching to a remote lane also imports and writes the components of that remote lane.
   * by default, only the components existing on the workspace will be imported from that lane, unless the "getAll"
   * flag is true.
   */
  async switchLanes(
    laneName: string,
    {
      alias,
      merge,
      forceOurs,
      forceTheirs,
      pattern,
      workspaceOnly,
      skipDependencyInstallation = false,
      skipFetch = false,
      branch = false,
    }: SwitchLaneOptions
  ) {
    if (!this.workspace) {
      throw new OutsideWorkspaceError();
    }
    this.workspace.inInstallContext = true;
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
      existingOnWorkspaceOnly: workspaceOnly,
      pattern,
      alias,
      skipFetch,
    };
    const checkoutProps = {
      mergeStrategy,
      forceOurs,
      forceTheirs,
      skipNpmInstall: skipDependencyInstallation,
      isLane: true,
      promptMergeOptions: false,
      reset: false,
      all: false,
    };

    // Create git branch if requested and git is available
    let gitBranchWarning: string | undefined;
    if (branch) {
      gitBranchWarning = await this.createGitBranchForLane(laneName);
    }

    const switchResult = await new LaneSwitcher(this.workspace, this.logger, switchProps, checkoutProps, this).switch();

    // Add git branch warning to the result if present
    if (gitBranchWarning) {
      switchResult.gitBranchWarning = gitBranchWarning;
    }

    return switchResult;
  }

  private async createGitBranchForLane(laneName: string): Promise<string | undefined> {
    if (!this.workspace) return;

    try {
      // Check if git exists in the project
      const isGit = await fs.pathExists('.git');
      if (!isGit) {
        const warning = 'Git repository not found. Skipping git branch creation.';
        this.logger.warn(warning);
        return warning;
      }

      const gitExecutablePath = getGitExecutablePath();

      // Create and checkout to the new git branch
      await execa(gitExecutablePath, ['checkout', '-b', laneName], {
        cwd: this.workspace.path,
      });

      this.logger.info(`Created and checked out git branch: ${laneName}`);
      return undefined; // No warning
    } catch (err: any) {
      // Don't fail the lane import if git branch creation fails
      const detailedError = err.stderr?.trim() || err.message;
      const warning = `Failed to create git branch "${laneName}".
  - Command: ${err.command}
  - Reason: ${detailedError}`;

      this.logger.warn(warning);
      return warning;
    }
  }

  /**
   * the values array may include zero to two values and will be processed as following:
   * [] => diff between the current lane and default lane. (only inside workspace).
   * [to] => diff between the current lane (or default-lane when in scope) and "to" lane.
   * [from, to] => diff between "from" lane and "to" lane.
   */
  public async getDiff(values: string[], diffOptions: DiffOptions = {}, pattern?: string): Promise<LaneDiffResults> {
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope, this.componentCompare);
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

    return filteredComponentIds.map((laneComponent) => laneComponent.id.changeVersion(laneComponent.head));
  }

  /**
   * hidden lane.updateDependents are intentionally excluded from `getLaneComponentIds` so the
   * default GraphQL `Lane.components` field stays workspace-facing. Consumers that need the full
   * lane graph (e.g. a CI dashboard surfacing cascade entries) opt in via this method or its
   * `updateDependentIds` / `updateDependentComponents` GraphQL counterparts. No bitmap filter
   * here — hidden entries by definition don't live in the bitmap.
   */
  async getLaneUpdateDependentIds(lane: LaneData): Promise<ComponentID[]> {
    if (!lane?.updateDependents?.length) return [];
    return lane.updateDependents.map((c) => c.id.changeVersion(c.head));
  }

  async getLaneUpdateDependentComponents(lane: LaneData): Promise<Component[]> {
    const ids = await this.getLaneUpdateDependentIds(lane);
    if (!ids.length) return [];
    const host = this.componentAspect.getHost();
    return host.getMany(ids);
  }

  async getLaneReadmeComponent(lane: LaneData): Promise<Component | undefined> {
    if (!lane) return undefined;
    const laneReadmeComponent = lane.readmeComponent;
    if (!laneReadmeComponent) return undefined;
    const host = this.componentAspect.getHost();
    const laneReadmeComponentId = laneReadmeComponent.id.changeVersion(laneReadmeComponent.head);
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

    const readmeComponentId = lane.readmeComponent.id;
    const existingLaneConfig =
      (await this.workspace.getSpecificComponentConfig(readmeComponentId, LanesAspect.id)) || {};

    const remoteLaneIdStr = lane.toLaneId().toString();

    if (existingLaneConfig.readme) {
      delete existingLaneConfig.readme[remoteLaneIdStr];
      await this.workspace.removeSpecificComponentConfig(readmeComponentId, LanesAspect.id, false);
      await this.workspace.addSpecificComponentConfig(readmeComponentId, LanesAspect.id, existingLaneConfig);
    }

    lane.setReadmeComponent(undefined);
    await scope.lanes.saveLane(lane, { laneHistoryMsg: 'remove readme' });
    await this.workspace.bitMap.write(`lane-remove-readme`);

    return { result: true };
  }

  async diffStatus(
    sourceLaneId: LaneId,
    targetLaneId?: LaneId,
    options?: LaneDiffStatusOptions
  ): Promise<LaneDiffStatus> {
    this.logger.profile(`diff status for source lane: ${sourceLaneId.name} and target lane: ${targetLaneId?.name}`);

    const sourceLane = sourceLaneId.isDefault()
      ? await this.getLaneDataOfDefaultLane()
      : await this.loadLane(sourceLaneId);

    const sourceLaneComponents = sourceLaneId.isDefault()
      ? sourceLane?.components.map((main) => ({ id: main.id, head: Ref.from(main.head) }))
      : sourceLane?.components;

    const targetLane = targetLaneId ? await this.loadLane(targetLaneId) : undefined;
    const targetLaneIds = targetLane?.toBitIds();
    const host = this.componentAspect.getHost();

    const resultMemoKey = this.diffStatusResultMemoKey(sourceLaneId, sourceLane, targetLaneId, targetLane, options);
    const earlyReturn = this.tryDiffStatusResultMemo(resultMemoKey, sourceLaneId, targetLaneId);
    if (earlyReturn) {
      this.logger.profile(`diff status for source lane: ${sourceLaneId.name} and target lane: ${targetLaneId?.name}`);
      return earlyReturn;
    }

    const targetMainHeads =
      !targetLaneId || targetLaneId?.isDefault()
        ? compact(
            await Promise.all(
              (sourceLaneComponents || []).map(async ({ id }) => {
                const componentId = await host.resolveComponentId(id);
                const headOnMain = await this.getHeadOnMain(componentId);
                return headOnMain ? id.changeVersion(headOnMain) : undefined;
              })
            )
          )
        : [];

    await this.importer.importObjectsFromMainIfExist(targetMainHeads, { cache: true });

    const diffProps = compact(
      await Promise.all(
        (sourceLaneComponents || []).map(async ({ id, head }) => {
          const componentId = await host.resolveComponentId(id);
          const sourceVersionObj = (await this.scope.legacyScope.objects.load(head, true)) as Version;

          if (sourceVersionObj.isRemoved()) {
            return null;
          }

          const headOnTargetLane = targetLaneIds
            ? targetLaneIds.searchWithoutVersion(id)?.version
            : await this.getHeadOnMain(componentId);

          if (headOnTargetLane) {
            const targetVersionObj = (await this.scope.legacyScope.objects.load(
              Ref.from(headOnTargetLane),
              true
            )) as Version;

            if (targetVersionObj.isRemoved()) {
              return null;
            }
          }

          const sourceHead = head.toString();
          const targetHead = headOnTargetLane;

          return { componentId, sourceHead, targetHead };
        })
      )
    );

    const snapDistancesByComponentId = new Map<
      string,
      {
        snapsDistance: SnapsDistance;
        sourceHead: string;
        targetHead?: string;
        componentId: ComponentID;
      }
    >();

    this.logger.profile(
      `get snaps distance for source lane: ${sourceLane?.id.name} and target lane: ${targetLane?.id.name} with ${diffProps.length} components`
    );
    let memoHits = 0;
    await pMap(
      diffProps,
      async ({ componentId, sourceHead, targetHead }) => {
        const memoKey = this.snapsDistanceMemoKey(componentId, sourceHead, targetHead);
        const cached = this.snapsDistanceMemo.get(memoKey);
        let snapsDistance: SnapsDistance | undefined;
        if (cached) {
          memoHits += 1;
          snapsDistance = this.snapsDistanceFromMemo(cached, componentId.toString());
        } else {
          const computed = await this.scope.getSnapsDistanceBetweenTwoSnaps(componentId, sourceHead, targetHead, false);
          if (computed) {
            // cache success + the deterministic "unrelated" outcome. transient errors stay uncached.
            if (!computed.err || computed.err instanceof NoCommonSnap) {
              this.memoStoreSnapsDistance(memoKey, computed);
            }
            snapsDistance = computed;
          }
        }
        if (snapsDistance) {
          snapDistancesByComponentId.set(componentId.toString(), {
            snapsDistance,
            sourceHead,
            targetHead,
            componentId,
          });
        }
      },
      { concurrency: concurrentComponentsLimit() }
    );
    this.logger.profile(
      `get snaps distance for source lane: ${sourceLane?.id.name} and target lane: ${targetLane?.id.name} with ${diffProps.length} components (memo hits: ${memoHits}/${diffProps.length})`
    );

    // when `skipUpToDate` is set, drop components whose snaps say the source already includes everything on
    // the target. they contribute nothing to a target→source review surface but each carries a full
    // `importWithoutDeps` round trip and a schema-extraction `apiDiff` call.
    const visibleDiffProps = options?.skipUpToDate
      ? diffProps.filter(({ componentId }) => {
          const entry = snapDistancesByComponentId.get(componentId.toString());
          return !entry || !entry.snapsDistance.isUpToDate();
        })
      : diffProps;

    const commonSnapsToImport = compact(
      visibleDiffProps.map(({ componentId }) => {
        const s = snapDistancesByComponentId.get(componentId.toString());
        return s?.snapsDistance.commonSnapBeforeDiverge
          ? s.componentId.changeVersion(s.snapsDistance.commonSnapBeforeDiverge.hash)
          : null;
      })
    );

    const sourceOrTargetLane =
      ((sourceLaneId.isDefault() ? null : (sourceLane as Lane)) ||
        (targetLaneId?.isDefault() ? null : (targetLane as Lane))) ??
      undefined;

    if (commonSnapsToImport.length > 0 && !options?.skipChanges && !options?.deferChanges) {
      this.logger.profile(`import common snaps for lane diff (${commonSnapsToImport.length} snaps)`);
      await this.scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(commonSnapsToImport), {
        cache: true,
        reason: `get the common snap for lane diff`,
        lane: sourceOrTargetLane,
      });
      this.logger.profile(`import common snaps for lane diff (${commonSnapsToImport.length} snaps)`);
    }

    this.logger.profile(`componentDiffStatus pMap (${visibleDiffProps.length} components)`);
    // run in parallel — bounded by `concurrentComponentsLimit()`. previously this was pMapSeries which
    // serialized 30 schema extractions and dominated the cold call (minutes).
    const results = await pMap(
      visibleDiffProps,
      async ({ componentId, sourceHead, targetHead }) =>
        this.componentDiffStatus(
          componentId,
          sourceHead,
          targetHead,
          snapDistancesByComponentId.get(componentId.toString())?.snapsDistance,
          options
        ),
      { concurrency: concurrentComponentsLimit() }
    );
    this.logger.profile(`componentDiffStatus pMap (${visibleDiffProps.length} components)`);

    // best-effort populate the top-level result memo. eagerly resolve `changes` for any deferred
    // components so the next cold call can return immediately — does not block this response.
    if (resultMemoKey) this.populateDiffStatusMemoAsync(resultMemoKey, results);

    // Pre-warm caches the lane-compare UI will hit right after this query returns:
    //   - `host.getMany([base+compare versioned ids])` populates `ScopeComponentLoader.componentsCache`
    //      so the UI's 20 per-component `getHost.get` queries (componentFields + componentFieldWithLogs
    //      for each side of each visible pair) all hit cache instead of racing through cold loads.
    //   - `componentCompare.compareComponents(pairs)` populates the new compare-result memo so the UI's
    //      `CompareComponents` query is answered from cache.
    // Fired *after* we have the answer ready — never blocks the response. Wrapped in catch() so any
    // background failure stays invisible to the caller.
    if (visibleDiffProps.length > 0) this.prewarmCompareCaches(host, visibleDiffProps);

    this.logger.profile(`diff status for source lane: ${sourceLaneId.name} and target lane: ${targetLaneId?.name}`);

    return {
      source: sourceLaneId,
      target: targetLaneId || this.getDefaultLaneId(),
      componentsStatus: results,
    };
  }

  private async componentDiffStatus(
    componentId: ComponentID,
    sourceHead: string,
    targetHead?: string,
    snapsDistance?: SnapsDistance,
    options?: LaneDiffStatusOptions
  ): Promise<LaneComponentDiffStatus> {
    if (snapsDistance?.err) {
      const noCommonSnap = snapsDistance.err instanceof NoCommonSnap;

      return {
        componentId,
        sourceHead,
        targetHead,
        upToDate: snapsDistance?.isUpToDate(),
        unrelated: noCommonSnap || undefined,
        changes: [],
      };
    }

    const commonSnap = snapsDistance?.commonSnapBeforeDiverge;

    // when changes are skipped or deferred, return the snap-distance metadata immediately and leave
    // `changes` unset. callers derive them lazily through `deriveComponentChanges` (used by the GraphQL
    // `changes` field resolver, which runs the work per-component in parallel only when the client
    // selects the field — keeps cold p50 under 200 ms even for many components).
    const changes =
      options?.skipChanges || options?.deferChanges
        ? undefined
        : await this.deriveChangeTypes(commonSnap, componentId, sourceHead);
    const changeType = changes ? changes[0] : undefined;

    return {
      componentId,
      changeType,
      changes,
      sourceHead,
      targetHead: commonSnap?.hash,
      upToDate: snapsDistance?.isUpToDate(),
      snapsDistance: {
        onSource: snapsDistance?.snapsOnSourceOnly.map((s) => s.hash) ?? [],
        onTarget: snapsDistance?.snapsOnTargetOnly.map((s) => s.hash) ?? [],
        common: snapsDistance?.commonSnapBeforeDiverge?.hash,
      },
      changesContext: { commonSnap, skipped: options?.skipChanges },
    };
  }

  /**
   * Lazily derive the change types for a single component diff status. Used by the GraphQL `changes`
   * field resolver so the (expensive) derivation only runs when the field is selected. Memoized per
   * status object via `changesContext.pending`, so selecting both `changes` and `changeType` computes
   * the value once.
   */
  async deriveComponentChanges(status: LaneComponentDiffStatus): Promise<ChangeType[] | undefined> {
    if (status.changes) return status.changes;
    const context = status.changesContext;
    if (!context || context.skipped) return undefined;

    // top-level memo on the final ChangeType[] — short-circuits BEFORE compare()/getAPIDiff() run.
    // Persisted to disk, keyed on immutable hashes, so a cold server start with a populated cache
    // answers the entire derivation from a Map.get().
    const memoKey = this.changeTypesMemoKey(status.componentId, status.sourceHead, context.commonSnap?.hash ?? null);
    const cached = this.changeTypesMemo.get(memoKey);
    if (cached) return cached;

    // single-flight concurrent requests for the same (componentId, sourceHead, commonSnap) tuple.
    let pending = this.changeTypesInflight.get(memoKey);
    if (!pending) {
      pending = this.deriveChangesLimit(() =>
        this.deriveChangeTypes(context.commonSnap, status.componentId, status.sourceHead)
      )
        .then((result) => {
          this.memoStoreChangeTypes(memoKey, result);
          return result;
        })
        .finally(() => {
          this.changeTypesInflight.delete(memoKey);
        });
      this.changeTypesInflight.set(memoKey, pending);
    }
    context.pending = pending;
    return pending;
  }

  async componentDiffStatusOld(
    componentId: ComponentID,
    sourceHead: string,
    targetHead?: string,
    options?: LaneDiffStatusOptions
  ): Promise<LaneComponentDiffStatus> {
    const snapsDistance = await this.scope.getSnapsDistanceBetweenTwoSnaps(componentId, sourceHead, targetHead, false);

    if (snapsDistance?.err) {
      const noCommonSnap = snapsDistance.err instanceof NoCommonSnap;

      return {
        componentId,
        sourceHead,
        targetHead,
        upToDate: snapsDistance?.isUpToDate(),
        unrelated: noCommonSnap || undefined,
        changes: [],
      };
    }

    const commonSnap = snapsDistance?.commonSnapBeforeDiverge;

    const changes = !options?.skipChanges
      ? await this.deriveChangeTypes(commonSnap, componentId, sourceHead)
      : undefined;
    const changeType = changes ? changes[0] : undefined;

    return {
      componentId,
      changeType,
      changes,
      sourceHead,
      targetHead: commonSnap?.hash,
      upToDate: snapsDistance?.isUpToDate(),
      snapsDistance: {
        onSource: snapsDistance?.snapsOnSourceOnly.map((s) => s.hash) ?? [],
        onTarget: snapsDistance?.snapsOnTargetOnly.map((s) => s.hash) ?? [],
        common: snapsDistance?.commonSnapBeforeDiverge?.hash,
      },
    };
  }

  private async deriveChangeTypes(
    commonSnap: { hash: string } | null | undefined,
    componentId: ComponentID,
    sourceHead: string
  ): Promise<ChangeType[]> {
    if (!commonSnap) return [ChangeType.NEW];

    const baseIdStr = componentId.changeVersion(commonSnap.hash).toString();
    const compareIdStr = componentId.changeVersion(sourceHead).toString();
    // Run `compare()` first. The public API can only change when source code changes — if no code
    // diff, skip the (expensive) schema extraction entirely. Cuts cold derivation by an order of
    // magnitude for components whose changes are config/deps only.
    const compare = await this.componentCompare.compare(baseIdStr, compareIdStr);
    const hasCodeChanges = compare.code.some((c) => c.status !== 'UNCHANGED');

    let hasApiChanges = false;
    if (hasCodeChanges) {
      const apiDiffKey = `${baseIdStr}|${compareIdStr}`;
      const cached = this.apiDiffMemo.get(apiDiffKey);
      if (cached !== undefined) {
        hasApiChanges = cached;
      } else {
        // single-flight in-flight requests so concurrent resolvers share one schema-extraction call.
        let pending = this.apiDiffInflight.get(apiDiffKey);
        if (!pending) {
          pending = this.componentCompare
            .getAPIDiff(baseIdStr, compareIdStr)
            .then((apiDiff) => {
              const result = apiDiff?.hasChanges ?? false;
              this.memoStoreApiDiff(apiDiffKey, result);
              return result;
            })
            .finally(() => {
              this.apiDiffInflight.delete(apiDiffKey);
            });
          this.apiDiffInflight.set(apiDiffKey, pending);
        }
        hasApiChanges = await pending;
      }
    }

    const hasFieldChanges = compare.fields.length > 0;

    if (!hasFieldChanges && !hasCodeChanges && !hasApiChanges) {
      return [ChangeType.NONE];
    }

    const changed: ChangeType[] = [];

    if (hasCodeChanges) {
      changed.push(ChangeType.SOURCE_CODE);
    }

    if (hasFieldChanges) {
      changed.push(ChangeType.ASPECTS);
    }

    const depsFields = ['dependencies', 'devDependencies', 'extensionDependencies'];
    if (compare.fields.some((field) => depsFields.includes(field.fieldName))) {
      changed.push(ChangeType.DEPENDENCY);
    }

    if (hasApiChanges) {
      changed.push(ChangeType.API);
    }

    return changed;
  }

  private async recreateNewLaneIfDeleted() {
    if (!this.workspace) return;
    const laneId = this.getCurrentLaneId();
    if (!laneId || laneId.isDefault() || this.workspace.consumer.bitMap.isLaneExported) {
      return;
    }
    const laneObj = await this.scope.legacyScope.getCurrentLaneObject();
    if (laneObj) {
      return;
    }
    await this.createLane(laneId.name, { scope: laneId.scope });
  }

  /**
   * if the local lane was forked from another lane, this gets the differences between the two.
   * it also fetches the original lane from the remote to make sure the data is up to date.
   */
  async listUpdatesFromForked(componentsList: ComponentsList): Promise<DivergeDataPerId[]> {
    const consumer = this.workspace?.consumer;
    if (!consumer) throw new Error(`unable to get listUpdatesFromForked outside of a workspace`);
    if (consumer.isOnMain()) {
      return [];
    }
    const lane = await consumer.getCurrentLaneObject();
    const forkedFromLaneId = lane?.forkedFrom;
    if (!forkedFromLaneId) {
      return [];
    }
    const forkedFromLane = await consumer.scope.loadLane(forkedFromLaneId);
    if (!forkedFromLane) return []; // should we fetch it here?

    const workspaceIds = consumer.bitMap.getAllBitIds();

    const duringMergeIds = componentsList.listDuringMergeStateComponents();

    const componentsFromModel = await componentsList.getModelComponents();
    const compFromModelOnWorkspace = componentsFromModel
      .filter((c) => workspaceIds.hasWithoutVersion(c.toComponentId()))
      // if a component is merge-pending, it needs to be resolved first before getting more updates from main
      .filter((c) => !duringMergeIds.hasWithoutVersion(c.toComponentId()));

    // by default, when on a lane, forked is not fetched. we need to fetch it to get the latest updates.
    await this.fetchLaneWithItsComponents(forkedFromLaneId);

    const remoteForkedLane = await consumer.scope.objects.remoteLanes.getRemoteLane(forkedFromLaneId);
    if (!remoteForkedLane.length) return [];

    const results = await Promise.all(
      compFromModelOnWorkspace.map(async (modelComponent) => {
        const headOnForked = remoteForkedLane.find((c) => c.id.isEqualWithoutVersion(modelComponent.toComponentId()));
        const headOnLane = modelComponent.laneHeadLocal;
        if (!headOnForked || !headOnLane) return undefined;
        const divergeData = await getDivergeData({
          repo: consumer.scope.objects,
          modelComponent,
          targetHead: headOnForked.head,
          sourceHead: headOnLane,
          throws: false,
        });
        if (!divergeData.snapsOnTargetOnly.length && !divergeData.err) return undefined;
        return { id: modelComponent.toComponentId(), divergeData };
      })
    );

    return compact(results);
  }

  /**
   * list components on a lane that their main got updates.
   */
  async listUpdatesFromMainPending(componentsList: ComponentsList): Promise<DivergeDataPerId[]> {
    const consumer = this.workspace?.consumer;
    if (!consumer) throw new Error(`unable to get listUpdatesFromForked outside of a workspace`);
    if (consumer.isOnMain()) {
      return [];
    }
    const allIds = consumer.bitMap.getAllBitIds();

    const duringMergeIds = componentsList.listDuringMergeStateComponents();

    const componentsFromModel = await componentsList.getModelComponents();
    const compFromModelOnWorkspace = componentsFromModel
      .filter((c) => allIds.hasWithoutVersion(c.toComponentId()))
      // if a component is merge-pending, it needs to be resolved first before getting more updates from main
      .filter((c) => !duringMergeIds.hasWithoutVersion(c.toComponentId()));

    // by default, when on a lane, main is not fetched. we need to fetch it to get the latest updates.
    await consumer.scope.scopeImporter.importWithoutDeps(
      ComponentIdList.fromArray(compFromModelOnWorkspace.map((c) => c.toComponentId())),
      {
        cache: false,
        includeVersionHistory: true,
        ignoreMissingHead: true,
        reason: 'main components of the current lane to check for updates',
      }
    );
    const results = await Promise.all(
      compFromModelOnWorkspace.map(async (modelComponent) => {
        const headOnMain = modelComponent.head;
        if (!headOnMain) return undefined;
        const checkedOutVersion = allIds.searchWithoutVersion(modelComponent.toComponentId())?.version;
        if (!checkedOutVersion) {
          throw new Error(
            `listUpdatesFromMainPending: unable to find ${modelComponent.toComponentId()} in the workspace`
          );
        }
        const headOnLane = modelComponent.getRef(checkedOutVersion);

        const divergeData = await getDivergeData({
          repo: consumer.scope.objects,
          modelComponent,
          targetHead: headOnMain,
          sourceHead: headOnLane,
          throws: false,
        });
        if (!divergeData.snapsOnTargetOnly.length && !divergeData.err) return undefined;
        return { id: modelComponent.toComponentId(), divergeData };
      })
    );

    return compact(results);
  }

  /**
   * default to remove all of them.
   * returns true if the lane has changed
   */
  async removeUpdateDependents(laneId: LaneId, ids?: ComponentID[]): Promise<boolean> {
    const lane = await this.loadLane(laneId);
    if (!lane) throw new BitError(`unable to find a lane ${laneId.toString()}`);
    if (ids?.length) {
      ids.forEach((id) => lane.removeComponentFromUpdateDependentsIfExist(id));
    } else {
      lane.removeAllUpdateDependents();
    }
    if (lane.hasChanged) {
      await this.scope.legacyScope.lanes.saveLane(lane, { laneHistoryMsg: 'remove update-dependents' });
      return true;
    }
    return false;
  }

  private async getLaneDataOfDefaultLane(): Promise<LaneData | null> {
    const consumer = this.workspace?.consumer;
    let bitIds: ComponentID[] = [];
    if (!consumer) {
      const scopeComponents = await this.scope.list();
      bitIds = scopeComponents.filter((component) => component.head).map((component) => component.id);
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

  get restoreRoutePath() {
    return '/lanes/restore';
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
    RemoveAspect,
    CheckoutAspect,
    InstallAspect,
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
    remove,
    checkout,
    install,
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
    ComponentWriterMain,
    RemoveMain,
    CheckoutMain,
    InstallMain,
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
      componentWriter,
      remove,
      checkout,
      install
    );
    const switchCmd = new SwitchCmd(lanesMain);
    const fetchCmd = new FetchCmd(importer);
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
      new LaneDiffCmd(workspace, scope, componentCompare),
      new LaneRemoveReadmeCmd(lanesMain),
      new LaneImportCmd(switchCmd, lanesMain),
      new LaneRemoveCompCmd(workspace, lanesMain),
      new LaneFetchCmd(fetchCmd, lanesMain),
      new LaneEjectCmd(lanesMain),
    ];
    laneCmd.commands.push(new LaneCurrentCmd(lanesMain));
    laneCmd.commands.push(new LaneHistoryCmd(lanesMain));
    laneCmd.commands.push(new LaneHistoryDiffCmd(lanesMain, workspace, scope, componentCompare));
    laneCmd.commands.push(new LaneCheckoutCmd(lanesMain));
    laneCmd.commands.push(new LaneRevertCmd(lanesMain));
    cli.register(laneCmd, switchCmd, new CatLaneHistoryCmd(lanesMain));
    cli.registerOnStart(async () => {
      await lanesMain.recreateNewLaneIfDeleted();
    });
    graphql.register(() => lanesSchema(lanesMain));
    express.register([
      new LanesCreateRoute(lanesMain, logger),
      new LanesDeleteRoute(lanesMain, logger),
      new LanesRestoreRoute(lanesMain, logger),
    ]);
    return lanesMain;
  }
}

LanesAspect.addRuntime(LanesMain);

export default LanesMain;
