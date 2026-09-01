/**
 * Manages the global capsules cache: origin markers, fast-delete + trash sweep, and the
 * prune pipeline (manual `bit capsule prune` and the gated auto-prune trigger).
 *
 * Owned by `IsolatorMain` but operationally independent — the isolator constructs an
 * instance, registers its hooks, and delegates the externally-visible cache-management
 * methods (`deleteCapsules`, `pruneCapsules`, `listAllCapsuleRoots`) to it. Keeps
 * `isolator.main.runtime.ts` focused on creating isolated component environments rather
 * than also being responsible for evicting them.
 */
import fs from 'fs-extra';
import { v4 } from 'uuid';
import path from 'path';
import { spawn } from 'child_process';
import pMap from 'p-map';
import type { Logger } from '@teambit/logger';
import type { CLIMain } from '@teambit/cli';
import type { ConfigStoreMain } from '@teambit/config-store';
import { concurrentIOLimit } from '@teambit/harmony.modules.concurrency';
import { isFeatureEnabled, CAPSULE_AUTO_PRUNE } from '@teambit/harmony.modules.feature-toggle';
import {
  CFG_CAPSULES_AUTO_PRUNE,
  CFG_CAPSULES_MAX_AGE_DAYS,
  CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR,
} from '@teambit/legacy.constants';
import type CapsuleList from './capsule-list';

/**
 * Marker file written into every capsule dir we manage. Its presence tells the prune logic
 * what kind of dir this is, where it came from, and (via its mtime) when it was last used.
 */
export const CAPSULE_ORIGIN_FILE = '.bit-capsule-origin.json';
export const CAPSULE_TRASH_DIR = '.trash';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type CapsuleKind = 'workspace' | 'scope-aspects-root' | 'scope-aspect' | 'scope';

const VALID_CAPSULE_KINDS: ReadonlySet<string> = new Set(['workspace', 'scope-aspects-root', 'scope-aspect', 'scope']);

export type CapsuleOriginMarker = {
  originPath: string;
  createdAt: string;
  kind: CapsuleKind;
};

export type PruneCapsulesOptions = {
  olderThanDays?: number;
  includeOrphans?: boolean;
  keepWorkspaceCaps?: boolean;
  dryRun?: boolean;
  /**
   * Compute byte sizes for every entry being considered. When false, all `sizeBytes`
   * in the report are 0 and the cache walk skips the expensive recursive `lstat` pass —
   * deletion (rename-to-trash) is O(1) and runs in milliseconds even on multi-GB caches.
   * Opt-in (via `bit capsule prune --with-sizes`) since the walk is slow on large caches.
   */
  withSizes?: boolean;
};

export type PruneCapsulesReport = {
  /** `originPath` is the workspace/scope a capsule was created for (from its marker), when known. */
  removed: { path: string; kind: CapsuleKind | 'unmarked'; reason: string; sizeBytes: number; originPath?: string }[];
  totalRemovedBytes: number;
  totalSizeBeforeBytes: number;
  totalSizeAfterBytes: number;
  dryRun: boolean;
};

export type CapsuleRootEntry = {
  path: string;
  kind: CapsuleKind | 'unmarked';
  originPath?: string;
  lastUsedMs: number;
  sizeBytes: number;
};

function toFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export class CapsuleCache {
  constructor(
    private logger: Logger,
    private cli: CLIMain,
    private configStore: ConfigStoreMain,
    /** Thunk so the cache stays independent of `GlobalConfigMain` — IsolatorMain forwards it. */
    private getRootDir: () => string
  ) {}

  async deleteCapsules(rootDir?: string): Promise<string> {
    const dirToDelete = rootDir || this.getRootDir();
    const marker = await this.readOriginMarker(dirToDelete);
    this.logger.debug(
      `[capsule-delete] removing ${dirToDelete}` + (marker?.originPath ? ` origin=${marker.originPath}` : '')
    );
    await this.scheduleFastDelete(dirToDelete);
    return dirToDelete;
  }

  /**
   * Move a capsule dir into a sibling `.trash/<uuid>/` so it disappears from the cache
   * immediately (same-filesystem rename is O(1)), then kick off a detached `rm -rf` so the
   * actual byte-by-byte cleanup happens in the background. This avoids the multi-second
   * stalls users see when deleting capsules with thousands of files.
   */
  async scheduleFastDelete(dir: string): Promise<void> {
    const exists = await fs.pathExists(dir);
    if (!exists) return;
    const globalRoot = this.getRootDir();
    // Edge case: deleting the global root itself. We can't move a dir into its own
    // child (`.trash/...`), so just do a direct remove. This is rare — only `bit
    // capsule delete --all` hits it.
    if (path.resolve(dir) === path.resolve(globalRoot)) {
      await fs.remove(dir);
      return;
    }
    const trashRoot = path.join(globalRoot, CAPSULE_TRASH_DIR);
    await fs.ensureDir(trashRoot);
    const trashTarget = path.join(trashRoot, `${path.basename(dir)}-${v4()}`);
    try {
      await fs.move(dir, trashTarget, { overwrite: true });
    } catch (err: any) {
      // Likely cross-device — fall back to a synchronous remove.
      this.logger.debug(`scheduleFastDelete: rename failed for ${dir}, falling back to fs.remove (${err.message})`);
      await fs.remove(dir);
      return;
    }
    // Run through the gated sweepTrashAsync path so we never have more than one sweep
    // running concurrently — even if many bit processes are moving things to trash.
    this.sweepTrashAsync();
  }

  /**
   * Sweep the `.trash` dir in a detached background process. Gated by a PID-stamped
   * lock so we never have more than one sweep running at a time across all concurrent
   * bit processes — previously we spawned one per `bit` invocation and they piled up
   * into the thousands, saturating disk I/O.
   */
  sweepTrashAsync(): void {
    const trashRoot = path.join(this.getRootDir(), CAPSULE_TRASH_DIR);
    // No trash → nothing to do. Cheap synchronous check avoids spawning a process at all.
    if (!fs.existsSync(trashRoot)) return;
    const lockPath = path.join(this.getRootDir(), '.trash-sweep.lock');
    if (this.isSweepLockActive(lockPath)) {
      this.logger.debug(`trash sweep already running (per ${lockPath}), skipping`);
      return;
    }
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'w' });
    } catch (err: any) {
      this.logger.debug(`failed to write sweep lock at ${lockPath}: ${err.message}`);
      return;
    }
    this.spawnDetachedSweep(trashRoot, lockPath);
  }

  /**
   * A sweep lock is "active" if the PID it names is still running. If the PID file
   * exists but the process is gone (e.g. crashed mid-sweep), we treat it as stale and
   * allow a new sweep to claim it.
   */
  private isSweepLockActive(lockPath: string): boolean {
    let pidStr: string;
    try {
      pidStr = fs.readFileSync(lockPath, 'utf8').trim();
    } catch {
      return false;
    }
    const pid = Number(pidStr);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
      // Signal 0 = "is this PID alive?" — no actual signal sent.
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Register a process-exit hook that, at most once per ~24h, spawns a detached
   * `bit capsule prune` child so the actual work runs out-of-process and never delays
   * the parent's exit. Gated by the mtime of a stamp file under the capsules root so
   * concurrent Bit invocations can't all trigger it at once, and behind the
   * `capsule-auto-prune` feature flag while the behavior is being validated.
   */
  registerAutoPruneHook(): void {
    this.cli.registerOnBeforeExit(async () => {
      try {
        await this.maybeAutoPrune();
      } catch (err: any) {
        this.logger.debug(`auto-prune skipped due to error: ${err?.message ?? err}`);
      }
    });
  }

  private async maybeAutoPrune(): Promise<void> {
    // Experimental: the automatic prune only runs for users who opt in via the feature flag
    // (`BIT_FEATURES=capsule-auto-prune` or `bit config set features=capsule-auto-prune`).
    // Until it's promoted to GA, the default behavior is unchanged — capsules are never
    // auto-deleted. The manual `bit capsule prune` command is always available regardless.
    if (!isFeatureEnabled(CAPSULE_AUTO_PRUNE)) return;

    // configStore may surface this as either string `'false'` (from `bit config set`)
    // or boolean `false` (from a hand-edited JSON config) — accept both. This is a
    // secondary escape hatch for once the feature is GA and the flag is removed.
    const enabled = this.configStore.getConfig(CFG_CAPSULES_AUTO_PRUNE);
    if (enabled === 'false' || (enabled as unknown) === false) return;

    const root = this.getRootDir();
    if (!(await fs.pathExists(root))) return;

    const stampPath = path.join(root, '.last-capsule-prune');
    const isStampFresh = async (): Promise<boolean> => {
      try {
        const stat = await fs.stat(stampPath);
        return Date.now() - stat.mtime.getTime() < ONE_DAY_MS;
      } catch {
        return false; // missing — needs a prune
      }
    };
    // Fast path: stamp is recent, nothing to do (no contention here).
    if (await isStampFresh()) return;

    // Atomic claim: only one process across all concurrent bit invocations may win the
    // daily slot. `wx` is O_CREAT|O_EXCL — it throws if the lock already exists, so the
    // check-and-write below can't race. The lock is held only for the few ms it takes to
    // re-check the stamp and spawn the detached child, then removed in `finally`.
    const claimPath = `${stampPath}.claim`;
    let claimed = false;
    try {
      await fs.close(await fs.open(claimPath, 'wx'));
      claimed = true;
    } catch {
      // Another process is mid-claim, or a previous run leaked the lock. If it's stale
      // (older than the daily window), reclaim it by removing + re-opening with O_EXCL —
      // if two processes race the reclaim, only one's `wx` open succeeds and the other
      // yields. Otherwise yield.
      try {
        const claimStat = await fs.stat(claimPath);
        if (Date.now() - claimStat.mtime.getTime() < ONE_DAY_MS) return;
        await fs.remove(claimPath);
        await fs.close(await fs.open(claimPath, 'wx'));
        claimed = true;
      } catch {
        return;
      }
    }
    try {
      // Re-check under the lock: a process that just held it may have refreshed the stamp.
      if (await isStampFresh()) return;
      await fs.outputFile(stampPath, '');

      // Guard against non-numeric/empty config (NaN) and negative values (which would
      // invert the age cutoff and wipe the whole cache).
      const olderThanDays = Math.max(0, toFiniteNumber(this.configStore.getConfig(CFG_CAPSULES_MAX_AGE_DAYS)) ?? 30);

      this.logger.debug(`[auto-prune] spawning detached child. olderThanDays=${olderThanDays}`);
      this.spawnDetachedAutoPrune(olderThanDays);
    } finally {
      if (claimed) {
        try {
          await fs.remove(claimPath);
        } catch {
          // ignore — a stale claim lock is reclaimed by the age check above
        }
      }
    }
  }

  /**
   * Fire-and-forget: spawn a detached child running `bit capsule prune`. Using the same
   * bit binary that's currently running (via process.argv[0] + argv[1]) so we don't depend
   * on PATH. stdio is ignored so nothing leaks to the user's terminal.
   *
   * Recursion guard: the child also runs onBeforeExit → maybeAutoPrune, but it reads the
   * stamp file that we just wrote and bails out before re-spawning.
   */
  private spawnDetachedAutoPrune(olderThanDays: number): void {
    const bitEntry = process.argv[1];
    if (!bitEntry) {
      this.logger.debug('[auto-prune] cannot detach: process.argv[1] is empty');
      return;
    }
    try {
      const child = spawn(process.execPath, [bitEntry, 'capsule', 'prune', '--older-than', String(olderThanDays)], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch (err: any) {
      this.logger.debug(`[auto-prune] failed to spawn detached child: ${err.message}`);
    }
  }

  /**
   * Spawn one detached Node process that recursively removes `trashRoot`. Using
   * `process.execPath` with an inline `fs.rmSync` keeps this portable across macOS,
   * Linux, and Windows (where there's no `rm` binary). When `lockPath` is given, the
   * child clears the lock on exit so the next bit invocation can claim a fresh sweep slot.
   */
  private spawnDetachedSweep(trashRoot: string, lockPath?: string): void {
    const script = lockPath
      ? `try { require('fs').rmSync(${JSON.stringify(trashRoot)}, { recursive: true, force: true }); } finally { try { require('fs').rmSync(${JSON.stringify(lockPath)}, { force: true }); } catch (_) {} }`
      : `require('fs').rmSync(${JSON.stringify(trashRoot)}, { recursive: true, force: true })`;
    try {
      const child = spawn(process.execPath, ['-e', script], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch (err: any) {
      this.logger.debug(`failed to spawn detached trash sweep: ${err.message}`);
      // Don't leak the lock if the spawn itself failed. Use fs-extra's removeSync
      // (rmSync isn't in the @types/fs-extra version pinned by this component).
      if (lockPath) {
        try {
          fs.removeSync(lockPath);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Write the origin marker if missing; otherwise just bump its mtime so it reflects
   * "last used at". Failures are non-fatal — markers are best-effort metadata.
   */
  async ensureOriginMarker(dir: string, kind: CapsuleKind, originPath: string): Promise<void> {
    const markerPath = path.join(dir, CAPSULE_ORIGIN_FILE);
    try {
      if (await fs.pathExists(markerPath)) {
        const now = new Date();
        await fs.utimes(markerPath, now, now);
        return;
      }
      const marker: CapsuleOriginMarker = {
        originPath,
        createdAt: new Date().toISOString(),
        kind,
      };
      await fs.outputJson(markerPath, marker);
    } catch (err: any) {
      this.logger.debug(`failed to write capsule origin marker at ${markerPath}: ${err.message}`);
    }
  }

  /**
   * Mark all per-component capsule subdirs as scope-aspect kind, originated from the
   * scope-aspects root. Used right after a scope-aspects isolation.
   */
  async ensureAspectCapsuleMarkers(capsuleList: CapsuleList, rootOriginPath: string): Promise<void> {
    await Promise.all(
      capsuleList.map(async (capsule) => {
        if (!fs.existsSync(capsule.path)) return;
        await this.ensureOriginMarker(capsule.path, 'scope-aspect', rootOriginPath);
      })
    );
  }

  /**
   * Single source of truth for the dated-capsules date-dir name (`YYYY-M-D`, no zero-pad).
   * Used by `getCapsulesRootDir` when writing and `pruneDatedCapsulesChildren` when reading,
   * so the two can never drift.
   */
  getDatedCapsuleDirName(date: Date = new Date()): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  /**
   * Standard filter for "real" capsule subdirs we may walk or prune. Skips files, the trash
   * dir (dot-prefixed), `node_modules`, and any other hidden/internal dir.
   */
  private isPrunableSubdir(entry: fs.Dirent): boolean {
    return entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.');
  }

  /**
   * Combined marker read + last-used resolution for a capsule dir: one `readJson`, one
   * fallback `stat`. Replaces the three-syscall (`readMarker` + `getOriginMarkerMtime` +
   * dir `stat`) idiom that was copy-pasted across the prune walks.
   */
  private async readMarkerInfo(dir: string): Promise<{ marker?: CapsuleOriginMarker; lastUsedMs: number }> {
    const marker = await this.readOriginMarker(dir);
    if (marker) {
      const mtime = await this.getOriginMarkerMtime(dir);
      if (mtime) return { marker, lastUsedMs: mtime.getTime() };
    }
    const stat = await fs.stat(dir).catch(() => undefined);
    return { marker, lastUsedMs: (stat?.mtime ?? new Date(0)).getTime() };
  }

  private async readOriginMarker(dir: string): Promise<CapsuleOriginMarker | undefined> {
    try {
      const raw = await fs.readJson(path.join(dir, CAPSULE_ORIGIN_FILE));
      if (
        raw &&
        typeof raw.originPath === 'string' &&
        // Reject unknown kinds (corrupted markers or values from a future Bit) so they
        // fall through to the 'unmarked' path in pruneCapsules rather than silently
        // skipping deletion.
        VALID_CAPSULE_KINDS.has(raw.kind)
      ) {
        return raw as CapsuleOriginMarker;
      }
    } catch {
      // missing or malformed — treat as unmarked
    }
    return undefined;
  }

  private async getOriginMarkerMtime(dir: string): Promise<Date | undefined> {
    try {
      const stat = await fs.stat(path.join(dir, CAPSULE_ORIGIN_FILE));
      return stat.mtime;
    } catch {
      return undefined;
    }
  }

  /**
   * Walk the global capsules root and return entries with their classification, size, and
   * last-used time. Used by prune and by `bit capsule list`.
   */
  async listAllCapsuleRoots(opts: { withSizes?: boolean } = {}): Promise<CapsuleRootEntry[]> {
    const withSizes = opts.withSizes !== false;
    const root = this.getRootDir();
    if (!(await fs.pathExists(root))) return [];
    const entries = await fs.readdir(root, { withFileTypes: true });
    const subdirs = entries.filter((e) => this.isPrunableSubdir(e));
    // Bounded concurrency: on a multi-GB cache with hundreds of subdirs and tens of
    // thousands of files per subdir, an unbounded Promise.all of recursive size walks
    // can hit OS file-descriptor limits (EMFILE) and thrash disk.
    return pMap(
      subdirs,
      async (entry) => {
        const subPath = path.join(root, entry.name);
        const { marker, lastUsedMs } = await this.readMarkerInfo(subPath);
        const sizeBytes = withSizes ? await this.computeDirSize(subPath) : 0;
        return {
          path: subPath,
          kind: (marker?.kind ?? 'unmarked') as CapsuleKind | 'unmarked',
          originPath: marker?.originPath,
          lastUsedMs,
          sizeBytes,
        };
      },
      { concurrency: concurrentIOLimit() }
    );
  }

  /**
   * Sum sizes of all entries under `dir`. Tolerant of symlinks and permission errors —
   * any failure returns the partial sum so we never throw from the prune path.
   * Uses bounded concurrency to avoid EMFILE on deep trees.
   */
  private async computeDirSize(dir: string): Promise<number> {
    let total = 0;
    const concurrency = concurrentIOLimit();
    const walk = async (current: string) => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      await pMap(
        entries,
        async (entry) => {
          const p = path.join(current, entry.name);
          if (entry.isDirectory()) {
            await walk(p);
          } else if (entry.isFile()) {
            try {
              const st = await fs.lstat(p);
              total += st.size;
            } catch {
              // ignore
            }
          }
        },
        { concurrency }
      );
    };
    await walk(dir);
    return total;
  }

  /**
   * Apply the prune rules from the plan:
   *   - workspace caps: deleted unconditionally (unless keepWorkspaceCaps)
   *   - scope-aspects-root: never deleted as a whole; per-aspect-version children pruned by age
   *   - scope caps and unmarked dirs older than threshold: deleted
   *   - orphans (marker says originPath gone): deleted
   */
  async pruneCapsules(opts: PruneCapsulesOptions = {}): Promise<PruneCapsulesReport> {
    // Clamp to >= 0: a negative age would put the cutoff in the future (everything looks
    // "too old" → whole cache deleted), almost certainly user error, so floor it at 0.
    const olderThanDays = Math.max(0, opts.olderThanDays ?? 30);
    const includeOrphans = opts.includeOrphans !== false;
    const keepWorkspaceCaps = opts.keepWorkspaceCaps === true;
    const dryRun = opts.dryRun === true;
    // Size accounting requires an expensive recursive lstat across the whole cache. Skip
    // it by default so the command returns in ms (deletes are O(1) renames); opt in via
    // `--with-sizes` when you want byte totals in the report.
    const computeSizes = opts.withSizes === true;
    const ageCutoffMs = Date.now() - olderThanDays * ONE_DAY_MS;
    const datedDirName = this.configStore.getConfig(CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR) || 'dated-capsules';

    const roots = await this.listAllCapsuleRoots({ withSizes: computeSizes });
    const totalSizeBefore = computeSizes ? roots.reduce((sum, r) => sum + r.sizeBytes, 0) : 0;
    const removed: PruneCapsulesReport['removed'] = [];

    const removeEntry = (
      p: string,
      kind: CapsuleKind | 'unmarked',
      reason: string,
      sizeBytes: number,
      originPath?: string
    ) => this.recordRemoval(removed, { path: p, kind, reason, sizeBytes, originPath }, dryRun);

    for (const root of roots) {
      if (path.basename(root.path) === datedDirName) {
        await this.pruneDatedCapsulesChildren(root.path, dryRun, computeSizes, removed);
        continue;
      }
      if (root.kind === 'workspace') {
        if (keepWorkspaceCaps) continue;
        await removeEntry(root.path, root.kind, 'workspace-cap', root.sizeBytes, root.originPath);
        continue;
      }
      if (root.kind === 'scope' || root.kind === 'unmarked') {
        const orphan = includeOrphans && root.originPath && !(await fs.pathExists(root.originPath));
        const tooOld = root.lastUsedMs < ageCutoffMs;
        if (orphan) {
          await removeEntry(root.path, root.kind, 'orphan', root.sizeBytes, root.originPath);
        } else if (tooOld) {
          // For unmarked dirs, sniff content first to avoid nuking a legacy scope-aspects root.
          if (root.kind === 'unmarked' && (await this.looksLikeAspectsRoot(root.path))) {
            await this.pruneAspectsRootChildren(root.path, ageCutoffMs, dryRun, computeSizes, removed);
          } else {
            await removeEntry(root.path, root.kind, `older-than-${olderThanDays}d`, root.sizeBytes, root.originPath);
          }
        }
        continue;
      }
      if (root.kind === 'scope-aspects-root') {
        await this.pruneAspectsRootChildren(root.path, ageCutoffMs, dryRun, computeSizes, removed);
        continue;
      }
    }

    const totalRemovedBytes = removed.reduce((sum, r) => sum + r.sizeBytes, 0);
    // For dry-run, report the *projected* post-prune size so the CLI summary stays
    // internally consistent (cache: X → X − freed). Real prune subtracts the same.
    const totalSizeAfter = Math.max(0, totalSizeBefore - totalRemovedBytes);

    return {
      removed,
      totalRemovedBytes,
      totalSizeBeforeBytes: totalSizeBefore,
      totalSizeAfterBytes: totalSizeAfter,
      dryRun,
    };
  }

  /**
   * Record a removal in the prune report and, unless this is a dry run, actually delete it
   * (fast rename-to-trash). Keeps the "report and delete are gated by the same dryRun flag"
   * invariant in one place so the per-kind prune helpers can't drift apart.
   */
  private async recordRemoval(
    removed: PruneCapsulesReport['removed'],
    entry: PruneCapsulesReport['removed'][number],
    dryRun: boolean
  ): Promise<void> {
    removed.push(entry);
    this.logger.debug(
      `[capsule-prune] ${dryRun ? 'would remove' : 'removing'} [${entry.kind} · ${entry.reason}] ${entry.path}` +
        (entry.originPath ? ` origin=${entry.originPath}` : '')
    );
    if (!dryRun) await this.scheduleFastDelete(entry.path);
  }

  /**
   * The `dated-capsules` dir holds per-date subdirs (`YYYY-M-D`) of in-flight isolation
   * runs. These are recreated on every isolation, so anything that isn't *today*'s
   * subdir is leftover from a previous run and safe to delete. Today's subdir is
   * preserved to avoid racing a concurrent bit process that may still be writing to it.
   */
  private async pruneDatedCapsulesChildren(
    rootPath: string,
    dryRun: boolean,
    computeSizes: boolean,
    removed: PruneCapsulesReport['removed']
  ): Promise<void> {
    const todayDir = this.getDatedCapsuleDirName();
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(rootPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!this.isPrunableSubdir(entry)) continue;
      if (entry.name === todayDir) continue;
      const childPath = path.join(rootPath, entry.name);
      const sizeBytes = computeSizes ? await this.computeDirSize(childPath) : 0;
      await this.recordRemoval(
        removed,
        { path: childPath, kind: 'unmarked', reason: 'dated-capsules-not-today', sizeBytes },
        dryRun
      );
    }
  }

  /**
   * Legacy unmarked dirs may still be a scope-aspects root. Heuristic: a child subdir whose
   * name contains `@` (aspect-version pattern like `teambit.node_node@1.3.4`).
   */
  private async looksLikeAspectsRoot(dir: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.some((e) => e.isDirectory() && e.name.includes('@'));
    } catch {
      return false;
    }
  }

  /**
   * Prune per-aspect-version children of a scope-aspects root purely by age (marker mtime,
   * which is touched on every aspect load).
   *
   * Note there's deliberately no orphan check here: a scope-aspect child's `originPath` is
   * the *logical* scope-aspects path (e.g. `<scope.path>-aspects`) used only to hash the
   * capsule root dir name — it need not exist as a real directory, so treating a missing
   * `originPath` as "orphan" would wrongly delete capsules of currently-used aspects.
   * Orphan pruning is still honored elsewhere for `workspace`/`scope` kinds.
   */
  private async pruneAspectsRootChildren(
    rootPath: string,
    ageCutoffMs: number,
    dryRun: boolean,
    computeSizes: boolean,
    removed: PruneCapsulesReport['removed']
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(rootPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!this.isPrunableSubdir(entry)) continue;
      const childPath = path.join(rootPath, entry.name);
      const { marker, lastUsedMs } = await this.readMarkerInfo(childPath);
      if (lastUsedMs < ageCutoffMs) {
        const sizeBytes = computeSizes ? await this.computeDirSize(childPath) : 0;
        await this.recordRemoval(
          removed,
          {
            path: childPath,
            kind: 'scope-aspect',
            reason: 'aspect-older-than-cutoff',
            sizeBytes,
            originPath: marker?.originPath,
          },
          dryRun
        );
      }
    }
  }
}
