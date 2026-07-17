import path from 'path';
import fs from 'fs-extra';
import type { ComponentID } from '@teambit/component-id';
import { ComponentID as ComponentIdValue } from '@teambit/component-id';
import type { LaneId } from '@teambit/lane-id';
import type { Logger } from '@teambit/logger';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import { NoCommonSnap } from '@teambit/legacy.scope';
import { CACHE_ROOT } from '@teambit/legacy.constants';
import type { ChangeType } from '@teambit/lanes.entities.lane-diff';
import { sha1 } from '@teambit/toolbox.crypto.sha1';

export type SerializedSnapsDistance = {
  unrelated?: boolean;
  isUpToDate: boolean;
  commonSnapHash?: string;
  snapsOnSourceHashes: string[];
  snapsOnTargetHashes: string[];
};

type SnapsDistanceSummary = {
  onSource: string[];
  onTarget: string[];
  common?: string;
};

/**
 * the slice of `LaneComponentDiffStatus` (lanes.main.runtime) that is safe to persist. structural —
 * the aspect's richer type (which adds non-serializable context like `changesContext`) is accepted
 * as-is; only these fields are stored.
 */
export type CacheableComponentStatus = {
  componentId: ComponentID;
  sourceHead: string;
  targetHead?: string;
  baseSource?: 'workspace' | 'scope';
  changes?: ChangeType[];
  changeType?: ChangeType;
  upToDate?: boolean;
  unrelated?: boolean;
  snapsDistance?: SnapsDistanceSummary;
};

type SerializedComponentStatus = Omit<CacheableComponentStatus, 'componentId'> & { componentIdStr: string };

export type LaneDiffStatusCacheOptions = {
  skipChanges?: boolean;
  skipUpToDate?: boolean;
};

/**
 * the composition shape the fingerprint needs. structural on purpose: the source side of a lane
 * diff can be a `Lane` model (head: Ref) OR the default-lane's `LaneData` (head: string) — both
 * expose stringable per-component heads, which is all the key requires.
 */
export type LaneLike = {
  components: Array<{ id: { toString(): string }; head: { toString(): string } }>;
};

/**
 * fingerprint of a lane's COMPOSITION: every component head, sorted, hashed. deliberately NOT
 * `lane.hash()` — that is a random uuid minted once at lane creation (`sha1(v4())`) and constant for
 * the lane's entire life, so a memo keyed on it would keep serving the same result as the lane
 * advances. empty string ⇒ unknown composition (never cache).
 */
export function laneCompositionFingerprint(lane: LaneLike | undefined): string {
  if (!lane?.components?.length) return '';
  return sha1(
    lane.components
      .map((c) => `${c.id.toString()}@${c.head.toString()}`)
      .sort()
      .join(',')
  );
}

/**
 * Disk-persisted memo layer for the lane-diff computation (extracted from `LanesMain` — everything
 * here exists to make `lanes.diffStatus` answer fast on warm and even cold (post-restart) servers).
 *
 * Three memos, all keyed on immutable snap hashes or lane-composition fingerprints:
 * - snaps-distance per (componentId, sourceHead, targetHead) — cold compute walks the snap graph.
 * - change-types per (componentId, sourceHead, commonSnapHash) — the final `ChangeType[]`.
 * - top-level diff-status result per (lane fingerprints + options) — the whole componentsStatus
 *   array, letting an unchanged lane pair answer from a single Map.get().
 *
 * Persistence is best-effort: loads self-catch (cold-but-correct on failure), saves are debounced
 * and fire-and-forget, and every save timer is unref'd so a pending flush never holds the process.
 */
export class LaneDiffCache {
  constructor(
    private logger?: Logger,
    /** overridable for tests — production always persists under the global bit cache root. */
    private persistDir: string = CACHE_ROOT,
    /** debounce window before a dirty memo is flushed to disk; overridable for tests. */
    private flushDelayMs: number = 500
  ) {}

  private loadPromise?: Promise<void>;

  /**
   * Lazily load all disk-persisted memos, exactly once. Awaited at the lane-diff entry points
   * rather than in the constructor — construction stays synchronous and side-effect-free, and
   * commands that never diff lanes pay nothing.
   */
  ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        this.loadSnapsDistanceFromDisk(),
        this.loadChangeTypesFromDisk(),
        this.loadDiffStatusFromDisk(),
      ]).then(() => {});
    }
    return this.loadPromise;
  }

  // ── snaps distance ────────────────────────────────────────────────────────
  // purely a function of (componentId, sourceHead, targetHead) — immutable hashes — so safe to
  // memoize indefinitely. cold compute is the dominant latency (~1.1s for 30 components walking the
  // snap graph + cold imports). LRU-bounded to keep the file small.

  private snapsDistanceMemo = new Map<string, SerializedSnapsDistance>();
  private snapsDistanceDirty = false;
  private snapsDistanceSaveTimer: NodeJS.Timeout | undefined;
  private static SNAPS_DISTANCE_MAX = 5000;
  private static SNAPS_DISTANCE_FILE = 'lane-diff-snaps-distance.json';

  snapsDistanceKey(componentId: ComponentID, sourceHead: string, targetHead?: string): string {
    return `${componentId.toStringWithoutVersion()}|${sourceHead}|${targetHead || ''}`;
  }

  /**
   * a cached distance, reconstructed for downstream consumers. they only touch `.err`,
   * `.isUpToDate()`, `.commonSnapBeforeDiverge.hash`, `.snapsOn{Source,Target}Only[].hash` — so a
   * duck-typed plain object suffices.
   */
  getSnapsDistance(key: string, componentIdStr: string): SnapsDistance | undefined {
    const s = this.snapsDistanceMemo.get(key);
    if (!s) return undefined;
    return {
      err: s.unrelated ? new NoCommonSnap(componentIdStr) : undefined,
      isUpToDate: () => s.isUpToDate,
      commonSnapBeforeDiverge: s.commonSnapHash ? { hash: s.commonSnapHash } : null,
      snapsOnSourceOnly: s.snapsOnSourceHashes.map((h) => ({ hash: h })),
      snapsOnTargetOnly: s.snapsOnTargetHashes.map((h) => ({ hash: h })),
    } as unknown as SnapsDistance;
  }

  storeSnapsDistance(key: string, snapsDistance: SnapsDistance): void {
    if (!this.snapsDistanceMemo.has(key) && this.snapsDistanceMemo.size >= LaneDiffCache.SNAPS_DISTANCE_MAX) {
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
    this.scheduleSave('snapsDistance');
  }

  private async loadSnapsDistanceFromDisk() {
    try {
      const raw = await fs.readFile(path.join(this.persistDir, LaneDiffCache.SNAPS_DISTANCE_FILE), 'utf8');
      const parsed = JSON.parse(raw) as Record<string, SerializedSnapsDistance>;
      for (const [k, v] of Object.entries(parsed)) this.snapsDistanceMemo.set(k, v);
      this.logger?.debug(`[lane-diff cache] loaded ${this.snapsDistanceMemo.size} snaps-distance entries`);
    } catch {
      // first run / corrupted file: start empty.
    }
  }

  // ── change types ──────────────────────────────────────────────────────────
  // the final `ChangeType[]` per (componentId, sourceHead, commonSnapHash) — immutable hashes,
  // deterministic forever. with this populated, a cold server answers `lanes.diffStatus` without
  // invoking compare/schema extraction: seconds become a Map.get().

  private changeTypesMemo = new Map<string, ChangeType[]>();
  private changeTypesDirty = false;
  private changeTypesSaveTimer: NodeJS.Timeout | undefined;
  private static CHANGE_TYPES_MAX = 5000;
  private static CHANGE_TYPES_FILE = 'lane-diff-change-types.json';

  /**
   * bumped when the meaning of the memoized `ChangeType[]` changes — keyed only on immutable
   * hashes, so without a version tag a stale entry would be served verbatim across an upgrade.
   * v2: ASPECTS no longer a superset of DEPENDENCY (dep-only changes no longer emit ASPECTS).
   */
  private static CHANGE_TYPES_VERSION = 2;

  changeTypesKey(componentId: ComponentID, sourceHead: string, commonHash: string | null | undefined): string {
    return `${componentId.toStringWithoutVersion()}|${sourceHead}|${commonHash ?? ''}`;
  }

  getChangeTypes(key: string): ChangeType[] | undefined {
    return this.changeTypesMemo.get(key);
  }

  storeChangeTypes(key: string, changes: ChangeType[]): void {
    if (!this.changeTypesMemo.has(key) && this.changeTypesMemo.size >= LaneDiffCache.CHANGE_TYPES_MAX) {
      const firstKey = this.changeTypesMemo.keys().next().value;
      if (firstKey) this.changeTypesMemo.delete(firstKey);
    }
    this.changeTypesMemo.set(key, changes);
    this.scheduleSave('changeTypes');
  }

  private async loadChangeTypesFromDisk() {
    try {
      const raw = await fs.readFile(path.join(this.persistDir, LaneDiffCache.CHANGE_TYPES_FILE), 'utf8');
      const parsed = JSON.parse(raw) as { v?: number; entries?: Record<string, ChangeType[]> };
      // legacy unversioned format or an older version: discard.
      if (parsed.v !== LaneDiffCache.CHANGE_TYPES_VERSION || !parsed.entries) return;
      for (const [k, v] of Object.entries(parsed.entries)) this.changeTypesMemo.set(k, v);
      this.logger?.debug(`[lane-diff cache] loaded ${this.changeTypesMemo.size} change-types entries`);
    } catch {
      // first run / corrupted file.
    }
  }

  // ── top-level diff-status result ──────────────────────────────────────────
  // the entire `componentsStatus` array per (lane fingerprints + options). an unchanged lane pair
  // answers from disk in one Map.get(), skipping imports, object loads and all derivation.

  private diffStatusMemo = new Map<string, SerializedComponentStatus[]>();
  private diffStatusDirty = false;
  private diffStatusSaveTimer: NodeJS.Timeout | undefined;
  private static DIFF_STATUS_MAX = 200;
  private static DIFF_STATUS_FILE = 'lane-diff-results.json';

  /**
   * bumped when the shape/meaning of a serialized status changes (it embeds the classification
   * produced by `deriveChangeTypes`).
   * v2: follows CHANGE_TYPES_VERSION v2 (dep-only changes no longer classified as ASPECTS).
   */
  private static DIFF_STATUS_VERSION = 2;

  /**
   * Build the top-level result memo key from the lanes' composition fingerprints (see
   * {@link laneCompositionFingerprint} — component heads, NOT the lane's constant uuid hash), so the
   * key moves with every snap and invalidates whenever either side advances. a main target has no
   * lane object → fingerprint the resolved per-component main heads instead.
   * Empty string ⇒ don't cache (incomplete state).
   */
  diffStatusKey(
    sourceLaneId: LaneId,
    sourceLane: LaneLike | undefined,
    targetLaneId: LaneId | undefined,
    targetLane: LaneLike | undefined,
    options?: LaneDiffStatusCacheOptions,
    targetMainHeads?: ComponentID[]
  ): string {
    const sourceFingerprint = laneCompositionFingerprint(sourceLane);
    if (!sourceFingerprint) return '';
    let targetFingerprint: string;
    if (targetLane) {
      targetFingerprint = laneCompositionFingerprint(targetLane);
      if (!targetFingerprint) return '';
    } else {
      const heads = (targetMainHeads || []).map((id) => id.toString()).sort();
      if (!heads.length) return '';
      targetFingerprint = sha1(heads.join(','));
    }
    const optionsKey = `${options?.skipChanges ? '1' : '0'}${options?.skipUpToDate ? '1' : '0'}`;
    return `${sourceLaneId.toString()}@${sourceFingerprint}|${targetLaneId?.toString() ?? 'default'}@${targetFingerprint}|${optionsKey}`;
  }

  getDiffStatus(key: string): CacheableComponentStatus[] | undefined {
    if (!key) return undefined;
    const cached = this.diffStatusMemo.get(key);
    if (!cached) return undefined;
    return cached.map(({ componentIdStr, ...rest }) => ({
      ...rest,
      componentId: ComponentIdValue.fromString(componentIdStr),
    }));
  }

  storeDiffStatus(key: string, statuses: CacheableComponentStatus[]): void {
    if (!key) return;
    if (!this.diffStatusMemo.has(key) && this.diffStatusMemo.size >= LaneDiffCache.DIFF_STATUS_MAX) {
      const firstKey = this.diffStatusMemo.keys().next().value;
      if (firstKey) this.diffStatusMemo.delete(firstKey);
    }
    this.diffStatusMemo.set(
      key,
      statuses.map((s) => ({
        componentIdStr: s.componentId.toString(),
        sourceHead: s.sourceHead,
        targetHead: s.targetHead,
        baseSource: s.baseSource,
        changes: s.changes,
        changeType: s.changeType,
        upToDate: s.upToDate,
        unrelated: s.unrelated,
        snapsDistance: s.snapsDistance,
      }))
    );
    this.scheduleSave('diffStatus');
  }

  private async loadDiffStatusFromDisk() {
    try {
      const raw = await fs.readFile(path.join(this.persistDir, LaneDiffCache.DIFF_STATUS_FILE), 'utf8');
      const parsed = JSON.parse(raw) as { v?: number; entries?: Record<string, SerializedComponentStatus[]> };
      // legacy unversioned format or an older version: discard.
      if (parsed.v !== LaneDiffCache.DIFF_STATUS_VERSION || !parsed.entries) return;
      for (const [k, v] of Object.entries(parsed.entries)) this.diffStatusMemo.set(k, v);
      this.logger?.debug(`[lane-diff cache] loaded ${this.diffStatusMemo.size} diff-status entries`);
    } catch {
      // first run / corrupted file.
    }
  }

  // ── persistence ───────────────────────────────────────────────────────────

  /**
   * debounce a burst of stores into ONE write per memo, `flushDelayMs` after the LAST store. the
   * timer is reset on every call — a store during a lane diff (once per component for a large lane)
   * pushes the flush out rather than letting an early write fire mid-burst, so the whole burst
   * collapses to a single serialization. fire-and-forget (disk failure yields a cold-but-correct
   * next start); timers are unref'd so a pending flush never keeps a CLI process alive.
   */
  private scheduleSave(memo: 'snapsDistance' | 'changeTypes' | 'diffStatus') {
    const specs = {
      snapsDistance: {
        getDirty: () => this.snapsDistanceDirty,
        setDirty: (v: boolean) => (this.snapsDistanceDirty = v),
        getTimer: () => this.snapsDistanceSaveTimer,
        setTimer: (t: NodeJS.Timeout | undefined) => (this.snapsDistanceSaveTimer = t),
        write: () => {
          const serialized: Record<string, SerializedSnapsDistance> = {};
          for (const [k, v] of this.snapsDistanceMemo) serialized[k] = v;
          return fs.outputFile(
            path.join(this.persistDir, LaneDiffCache.SNAPS_DISTANCE_FILE),
            JSON.stringify(serialized)
          );
        },
      },
      changeTypes: {
        getDirty: () => this.changeTypesDirty,
        setDirty: (v: boolean) => (this.changeTypesDirty = v),
        getTimer: () => this.changeTypesSaveTimer,
        setTimer: (t: NodeJS.Timeout | undefined) => (this.changeTypesSaveTimer = t),
        write: () => {
          const entries: Record<string, ChangeType[]> = {};
          for (const [k, v] of this.changeTypesMemo) entries[k] = v;
          return fs.outputFile(
            path.join(this.persistDir, LaneDiffCache.CHANGE_TYPES_FILE),
            JSON.stringify({ v: LaneDiffCache.CHANGE_TYPES_VERSION, entries })
          );
        },
      },
      diffStatus: {
        getDirty: () => this.diffStatusDirty,
        setDirty: (v: boolean) => (this.diffStatusDirty = v),
        getTimer: () => this.diffStatusSaveTimer,
        setTimer: (t: NodeJS.Timeout | undefined) => (this.diffStatusSaveTimer = t),
        write: () => {
          const entries: Record<string, SerializedComponentStatus[]> = {};
          for (const [k, v] of this.diffStatusMemo) entries[k] = v;
          return fs.outputFile(
            path.join(this.persistDir, LaneDiffCache.DIFF_STATUS_FILE),
            JSON.stringify({ v: LaneDiffCache.DIFF_STATUS_VERSION, entries })
          );
        },
      },
    }[memo];

    specs.setDirty(true);
    // reset the debounce: clear any pending flush and re-arm, so the write lands `flushDelayMs`
    // after the LAST store, not the first (the difference between debounce and throttle).
    const existing = specs.getTimer();
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      specs.setTimer(undefined);
      if (!specs.getDirty()) return;
      specs.setDirty(false);
      specs.write().catch(() => {});
    }, this.flushDelayMs);
    timer.unref?.();
    specs.setTimer(timer);
  }
}
