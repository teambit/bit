import chalk from 'chalk';
import type { Logger } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import type { LaneData } from '@teambit/legacy.scope';
import { getCloudDomain } from '@teambit/legacy.constants';
import { FileStatus } from '@teambit/component.modules.merge-helper';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { git } from '../git';
import type { CiMain } from '../ci.main.runtime';
import type { CiSyncConfig } from './sync-config';
import { laneNameToBranch } from './sync-config';
import {
  CONFLICT_LABEL,
  SYNC_COMMIT_MARKER,
  buildSyncCommitMessage,
  isSyncCommitMessage,
  readBranchSyncState,
  hasSyncMarker,
} from './sync-state';
import type { GitHostProvider, PrInfo } from './git-host-provider';
import { planLaneSync } from './sync-planner';
import { addAllExceptScopeAndModules, branchExistsOnRemote, cleanUntrackedScoped, ensureGitIdentity } from './git-ops';

/**
 * Prefix of the summary line returned by `syncLane` when a lane could not be reconciled. The
 * command layer scans the collected summaries for this prefix to decide the process exit code —
 * `syncLane` deliberately does NOT throw on halt, because one unreconcilable lane must not abort
 * the sync of every other lane in the run.
 */
export const HALT_SUMMARY_PREFIX = 'HALTED';

export type LaneSyncDeps = {
  lanes: LanesMain;
  /** for snapPrCommit + getDefaultBranchName + switchToLaneForSync */
  ci: CiMain;
  logger: Logger;
  /**
   * The git host serving `origin`, resolved from the registered providers (see `git-host-provider.ts`).
   * undefined => no provider claimed the remote, or the one that did has no credentials; every PR
   * operation is then logged and skipped, and the git half of the sync still runs.
   */
  gitHost?: GitHostProvider;
  cfg: Required<CiSyncConfig>;
  defaultScope: string;
};

/**
 * Fingerprint of a lane's content, used as the `Bit-Lane-Head` trailer value on sync commits.
 *
 * We deliberately do NOT use `LaneData.hash`: that hash is minted randomly at lane-creation time
 * (`sha1(v4())`) and does not change when the lane's components advance, so it can't answer "did
 * the lane move since we last synced it?". Instead we derive the value from content: sort the
 * `<component-id>@<head>` pairs (so the remote's ordering can't perturb it) and join with a
 * newline.
 *
 * The join is then hashed rather than stored verbatim, because the value has to survive a
 * round-trip through a git commit trailer — `parseLaneHeadTrailer` reads it with `(\S+)`, so a
 * multi-line (or space-containing) value would be truncated to its first token. sha1 of the join is
 * a single 40-hex token, is stable across processes and machines (pure content), and keeps the
 * abbreviated form used in the commit subject meaningful.
 */
export function laneHeadFingerprint(components: LaneData['components']): string {
  const joined = components
    .map((comp) => `${comp.id.toStringWithoutVersion()}@${comp.head}`)
    .sort()
    .join('\n');
  return sha1(joined);
}

export class LaneSyncExecutor {
  constructor(private deps: LaneSyncDeps) {}

  /**
   * `readBranchSyncState` and every `origin/<ref>` comparison below assume the remote refs in this
   * checkout are current, so we fetch once per executor instance rather than once per lane — a
   * `bit ci sync` run reconciles many lanes and re-fetching for each would multiply the network
   * cost without changing the answer (the run's view of the remote is a snapshot either way).
   */
  private fetched = false;

  /**
   * Reconcile one lane with its git branch/PR.
   *
   * Returns a single human-readable summary line. On a halt the line starts with
   * `HALT_SUMMARY_PREFIX` so the caller can aggregate failures and exit non-zero; **it does not
   * throw** — that is the contract the `--all` loop is written against, and it has to hold for every
   * failure mode, not only the ones each step anticipates. The steps below route their own expected
   * failures to `executeHalt`; this wrapper is what covers the unexpected ones (a git command that
   * fails, a `checkout -B` that collides, a push the remote rejects, a git-host API that throws where
   * nobody expected it), any of which would otherwise abort the sync of every lane after this one.
   */
  async syncLane(laneName: string, opts: { dryRun?: boolean } = {}): Promise<string> {
    const { cfg, defaultScope, logger } = this.deps;
    const branch = laneNameToBranch(laneName, cfg);
    const laneIdStr = `${defaultScope}/${laneName}`;
    try {
      return await this.reconcileLane({ laneName, laneIdStr, branch, dryRun: opts.dryRun });
    } catch (e: any) {
      const reason = `unexpected error: ${e?.message || e}`;
      try {
        // Halt properly where we can: label the PR and comment the resolution steps, so the lane is
        // visibly handed to a human rather than only mentioned in the run's summary.
        return await this.executeHalt({ laneName, laneIdStr, branch, reason, pr: await this.findPr(branch) });
      } catch (haltError: any) {
        // The halt itself failed. There is nothing left to try, and throwing here would abort the
        // remaining lanes — the exact outcome this wrapper exists to prevent — so report and move on.
        logger.error(`bit ci sync: failed to halt lane ${laneIdStr}`, haltError);
        logger.consoleWarning(`Could not record the halt of lane ${laneIdStr}: ${haltError?.message || haltError}`);
        return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
      }
    }
  }

  private async reconcileLane({
    laneName,
    laneIdStr,
    branch,
    dryRun,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    dryRun?: boolean;
  }): Promise<string> {
    const { logger } = this.deps;

    await this.fetchOnce();

    const defaultBranch = await this.deps.ci.getDefaultBranchName();
    const remoteLane = await this.getRemoteLane(laneName);
    const laneHead = remoteLane ? laneHeadFingerprint(remoteLane.components) : undefined;
    const branchExists = await branchExistsOnRemote(branch);
    // No branch => no history to read (and `git log origin/<branch>` would throw). The planner
    // short-circuits on `!branchExists` before it looks at any of these fields.
    const branchState = branchExists
      ? await readBranchSyncState(branch, defaultBranch)
      : { lastSyncedHead: undefined, hasDevCommits: false, tipMessage: '' };
    if (hasSyncMarker(branchState.tipMessage)) {
      logger.console('branch tip is a bit-sync commit; reconciler will no-op unless the lane moved');
    }
    const pr = await this.findPr(branch);
    const conflictLabelPresent = pr?.labels.includes(CONFLICT_LABEL) ?? false;

    const action = planLaneSync({
      laneHead,
      branchExists,
      lastSyncedHead: branchState.lastSyncedHead,
      hasDevCommits: branchState.hasDevCommits,
      conflictLabelPresent,
    });

    logger.console(
      chalk.blue(
        `${laneName} -> ${action.type} (branch: ${branch}, lane head: ${laneHead?.slice(0, 9) ?? 'none'}, ` +
          `last synced: ${branchState.lastSyncedHead?.slice(0, 9) ?? 'none'}, dev commits: ${branchState.hasDevCommits})`
      )
    );

    if (dryRun) {
      const line = `${laneName} -> ${action.type}`;
      logger.console(chalk.yellow(`🏃 Dry-run: ${line}`));
      return line;
    }

    switch (action.type) {
      case 'noop':
        return `${laneName} -> noop (${action.reason})`;
      case 'import-lane':
        // `laneHead` is always defined on this path — the planner only emits import-lane when the
        // lane exists on the remote. `remoteLane` is its LaneData (needed for the PR body).
        return this.executeImportLane({
          laneName,
          laneIdStr,
          branch,
          branchExists,
          defaultBranch,
          laneHead: laneHead as string,
          remoteLane: remoteLane as LaneData,
          pr,
        });
      case 'export-branch':
        return this.executeExportBranch({ laneName, laneIdStr, branch, defaultBranch });
      case 'merge-diverged':
        return this.executeMergeDiverged({ laneName, laneIdStr, branch, defaultBranch });
      case 'close-pr':
        return this.executeClosePr({ laneName, laneIdStr, branch, pr });
      case 'halt':
        return this.executeHalt({ laneName, laneIdStr, branch, reason: action.reason, pr });
      default: {
        // exhaustiveness guard: a new action type must be handled explicitly rather than silently
        // treated as a no-op.
        const unhandled: never = action;
        throw new Error(`bit ci sync: unhandled lane sync action ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * Mirror the remote lane onto the branch: check the branch out, materialize the lane into the
   * workspace, and commit the result with a `Bit-Lane-Head` trailer that records which lane state
   * this commit represents.
   */
  private async executeImportLane({
    laneName,
    laneIdStr,
    branch,
    branchExists,
    defaultBranch,
    laneHead,
    remoteLane,
    pr,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    branchExists: boolean;
    defaultBranch: string;
    laneHead: string;
    remoteLane: LaneData;
    pr?: PrInfo;
  }): Promise<string> {
    const { logger } = this.deps;
    logger.console(chalk.blue(`Importing lane ${laneIdStr} onto branch ${branch}`));

    // A brand-new lane branch forks from the default branch; an existing one is reset to whatever
    // the remote has, so a stale local copy of the branch can never leak into the sync commit.
    const startPoint = branchExists ? `origin/${branch}` : `origin/${defaultBranch}`;
    await this.checkoutFromRemote(branch, startPoint);

    try {
      // Write the lane's files and `.bitmap` into the workspace. This is the load-bearing step: the
      // sync commit below asserts (via the `Bit-Lane-Head` trailer) that the branch mirrors the lane,
      // so if nothing is materialized the trailer becomes a permanent lie and every later run reports
      // the pair as converged. See `materializeLane` for why a plain `switchToLaneForSync` is not
      // enough.
      const switchErr = await this.materializeLane(laneIdStr);
      if (switchErr) {
        // A failed switch is a halt, not a crash: the lane may reference a component this workspace
        // can't resolve, which needs a human. `finally` still restores the workspace.
        return await this.executeHalt({
          laneName,
          laneIdStr,
          branch,
          reason: `failed to switch to lane ${laneIdStr}: ${switchErr.message}`,
          pr,
        });
      }

      await this.commitAllAndPush(branch, buildSyncCommitMessage(laneIdStr, laneHead));

      let prUrl = pr?.htmlUrl;
      if (!pr) {
        prUrl = await this.openPrForLane({ laneName, laneIdStr, branch, defaultBranch, laneHead, remoteLane });
      }
      return (
        `${laneName} -> import-lane (pushed ${branch} @ lane ${laneHead.slice(0, 9)}` +
        `${prUrl ? `, PR ${prUrl}` : ''})`
      );
    } finally {
      await this.restoreWorkspace(defaultBranch);
    }
  }

  /**
   * Push the branch's dev commits back onto the lane: snap+export the branch's working tree onto
   * the lane, then record the resulting lane head on the branch with a fresh trailer commit so the
   * next run sees the two sides as converged.
   */
  private async executeExportBranch({
    laneName,
    laneIdStr,
    branch,
    defaultBranch,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
  }): Promise<string> {
    const { logger } = this.deps;
    logger.console(chalk.blue(`Exporting branch ${branch} onto lane ${laneIdStr}`));

    const message = await this.lastNonSyncCommitMessage(branch, defaultBranch);
    await this.checkoutFromRemote(branch, `origin/${branch}`);

    try {
      const exportErr = await this.snapAndExportOntoLane(laneIdStr, message);
      if (exportErr) {
        // Halt rather than propagate: `bit ci sync` reconciles many lanes in one run, and one lane's
        // failed snap/export (a stale lane needing a human, a build error, a rejected export) must not
        // abort the lanes after it. The halt labels the PR, records the reason, and makes the run exit
        // non-zero via the HALTED summary.
        return await this.executeHalt({
          laneName,
          laneIdStr,
          branch,
          reason: `failed to snap and export branch ${branch} onto lane ${laneIdStr}: ${exportErr.message}`,
          pr: await this.findPr(branch),
        });
      }

      const laneHead = await this.recordLaneHeadOnBranch(laneName, laneIdStr, branch);
      if (!laneHead) {
        return await this.executeHalt({
          laneName,
          laneIdStr,
          branch,
          reason: `lane ${laneIdStr} could not be read back from the remote after export`,
          pr: await this.findPr(branch),
        });
      }
      return `${laneName} -> export-branch (lane ${laneIdStr} @ ${laneHead.slice(0, 9)}, branch ${branch} updated)`;
    } finally {
      await this.restoreWorkspace(defaultBranch);
    }
  }

  /**
   * Both sides moved since the last sync: the lane has snaps the branch has never seen, and the
   * branch has dev commits the lane has never seen. Converging that requires a real content merge
   * *before* anything is written to either side, in this order:
   *
   * 1. **Merge the lane into the branch's working tree** (`mergeLaneIntoBranchWorkingTree`, i.e.
   *    `bit checkout head --manual`). Conflicts → discard the marker writes and halt for a human.
   * 2. **Snap + export the merged tree** onto the lane. Only now does the lane advance, and it
   *    advances to a snap that contains *both* sides — the snap *is* the merge.
   * 3. **Record the resulting lane head on the branch** with a fresh `Bit-Lane-Head` trailer and push,
   *    so the next run sees the pair as converged.
   *
   * Why the merge cannot be skipped in favour of "just export and let the export recover": the export
   * path snaps through `snapPrCommit` → `switchToLane`, which defaults to `forceOurs: true`.
   * `getComponentStatusBeforeMergeAttempt` returns without `propsForMerge` under `forceOurs`
   * (`checkout.main.runtime.ts:580`), so `applyVersion` marks every file `unchanged`, leaves the
   * filesystem alone and only moves `.bitmap` onto the lane heads. The snap that follows therefore
   * records *the branch's* tree against the new lane head: every lane-side file edit is silently
   * reverted on the lane tip, the branch never receives the lane's content, and the trailer this
   * method pushes would then assert convergence over that loss. `exportWithAdoptOnConflict` cannot
   * save it either — it rebases parent pointers, it does not merge files.
   *
   * Anything unexpected halts. This method never throws: one unreconcilable lane must not abort the
   * lanes after it in the run.
   */
  private async executeMergeDiverged({
    laneName,
    laneIdStr,
    branch,
    defaultBranch,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
  }): Promise<string> {
    const { logger } = this.deps;
    logger.console(
      chalk.yellow(
        `Diverged: lane ${laneIdStr} and branch ${branch} both moved since the last sync — attempting to converge`
      )
    );

    const halt = async (reason: string) =>
      this.executeHalt({ laneName, laneIdStr, branch, reason, pr: await this.findPr(branch) });

    try {
      // Force-checkout `origin/<branch>` and reload `.bitmap` into the live workspace: the merge below
      // depends on that file for both the lane pointer (which lane is "current") and the merge base
      // (which snap each component is on), and a stale local branch must never leak into the result.
      await this.resetToRemoteBranch(branch);

      // ---- step 1: merge the lane's snaps into the branch's working tree -----------------------
      const merge = await this.mergeLaneIntoBranchWorkingTree(laneIdStr);
      if (merge.error) {
        return await halt(`failed to merge lane ${laneIdStr} into branch ${branch}: ${merge.error.message}`);
      }
      if (merge.conflicts.length) {
        // The merge left conflict markers in the working tree. Discard them before halting so the
        // workspace (and any later push from this run) can never carry a half-merged tree.
        await this.resetToRemoteBranch(branch);
        return await halt(`merge conflicts in: ${merge.conflicts.join(', ')}`);
      }
      logger.console(
        chalk.green(`Merged lane ${laneIdStr} into ${branch} with no conflicts — snapping the merged tree`)
      );

      // ---- step 2: snap + export the merged tree onto the lane ---------------------------------
      // The working tree now holds both sides, so this snap is the merge commit on the lane. Any
      // failure here (build error, rejected export, stale lane) halts: the reconciler makes exactly
      // one attempt per lane per run and never guesses at a second recovery.
      const exportErr = await this.snapAndExportOntoLane(
        laneIdStr,
        `merge remote lane ${laneIdStr} into ${branch} ${SYNC_COMMIT_MARKER}`
      );
      if (exportErr) {
        return await halt(
          `merged lane ${laneIdStr} into branch ${branch} cleanly, but snapping/exporting the merged ` +
            `result failed: ${exportErr.message}`
        );
      }

      // ---- step 3: record the new lane head on the branch --------------------------------------
      const laneHead = await this.recordLaneHeadOnBranch(laneName, laneIdStr, branch);
      if (!laneHead) {
        return await halt(`lane ${laneIdStr} could not be read back from the remote after the merge export`);
      }
      return (
        `${laneName} -> merge-diverged (merged lane into branch, then exported; lane ${laneIdStr} @ ` +
        `${laneHead.slice(0, 9)}, branch ${branch} updated)`
      );
    } catch (e: any) {
      // Every step above routes its own failures to `halt`, so reaching here means something
      // unforeseen — a git command that failed, a `.bitmap` the workspace couldn't re-read. Halt
      // anyway: the reconciler's contract is that no single lane can abort the rest of the run.
      return await halt(
        `unexpected failure while reconciling diverged lane ${laneIdStr} with branch ${branch}: ${e?.message || e}`
      );
    } finally {
      await this.restoreWorkspace(defaultBranch);
    }
  }

  /**
   * Snap the workspace's current tree onto the lane and export it. Returns the error instead of
   * throwing, so the caller can halt (labelling the PR) rather than aborting the whole run.
   *
   * NOTE for callers: this snaps *whatever is in the workspace*, and `snapPrCommit`'s switch onto the
   * lane uses `forceOurs`, which never merges files. So on a diverged lane the tree must already hold
   * the merged content before this is called — see `executeMergeDiverged`.
   *
   * `keepLane` reuses the existing remote lane so the lane's history and any Bit Cloud lane-based
   * edits survive across syncs (the temp-lane flow recreates the lane on every run, which would churn
   * the very lane we're mirroring). `skipCleanup` leaves the workspace on the lane so the `.bitmap`
   * written by the snap is what the caller commits onto the branch — restoring to main first would
   * reset it to main's state and the branch would lose the lane pointer. `noDestructiveRecovery`
   * turns `snapAndExportReusingLane`'s stale-lane recovery (delete the remote lane, re-fork it from
   * main) into a throw: that recovery is acceptable for a throwaway PR lane, but here the lane is the
   * authored artifact being synced.
   */
  private async snapAndExportOntoLane(laneIdStr: string, message: string): Promise<Error | undefined> {
    try {
      await this.deps.ci.snapPrCommit({
        laneIdStr,
        message,
        build: undefined,
        strict: undefined,
        keepLane: true,
        skipCleanup: true,
        noDestructiveRecovery: true,
      });
      return undefined;
    } catch (e: any) {
      return e instanceof Error ? e : new Error(String(e?.message ?? e));
    }
  }

  /**
   * Record on the branch which lane state it now mirrors: re-query the lane (the export just moved
   * it, so any fingerprint taken before is stale), commit everything with a fresh `Bit-Lane-Head`
   * trailer, and push. Returns the fingerprint, or `undefined` when the lane can no longer be read
   * from the remote — in which case the caller halts rather than committing a trailer it can't back.
   */
  private async recordLaneHeadOnBranch(
    laneName: string,
    laneIdStr: string,
    branch: string
  ): Promise<string | undefined> {
    const remoteLane = await this.getRemoteLane(laneName);
    if (!remoteLane) return undefined;
    const laneHead = laneHeadFingerprint(remoteLane.components);
    await this.commitAllAndPush(branch, buildSyncCommitMessage(laneIdStr, laneHead));
    return laneHead;
  }

  /**
   * Merge the lane's snaps into the branch's working tree — bit's own remedy for "this lane moved
   * under me while I have local modifications", i.e. `bit checkout head --manual`:
   *
   * - `head` resolves every lane component to the (freshly fetched) remote lane head;
   * - a component the branch modified is three-way merged, base = the version in the branch's
   *   `.bitmap` (the last synced snap), ours = the branch's files, theirs = the lane's new snap;
   * - a component only the lane moved is written from the lane;
   * - a component that is only on the lane is added to the workspace (`getNewComponentsFromLane`,
   *   which is why `workspaceOnly` must stay false).
   *
   * Returns the ids whose merge left conflicts, so the caller can halt with them. It returns errors
   * rather than throwing; `bit checkout` throws for any component it refuses to touch (e.g. a
   * merge-pending one), which is a halt, not a crash.
   *
   * Why not `mergeLanes.mergeLane(...)`: both "sides" of this divergence are the *same lane id* (the
   * lane on bit.cloud vs. the state the branch was last synced from), and `validateMergeFlags` throws
   * `unable to merge lane "<id>", you're already at this lane. to get updates, simply run
   * "bit checkout head"` for equal ids — the alternative of passing main as the current lane would
   * squash-merge the lane into main, which is a different (and destructive) operation. On top of that,
   * `mergeLane` refuses to run at all while components are modified (`component is modified, please
   * snap/tag it first`), which is exactly the branch's state here. `checkout head` is the operation
   * bit's own error message points at, and it keeps the correct merge base.
   */
  private async mergeLaneIntoBranchWorkingTree(laneIdStr: string): Promise<{ conflicts: string[]; error?: Error }> {
    const { logger, lanes } = this.deps;
    try {
      // `checkout head` merges into *the current lane*, so the workspace must already be on the lane —
      // which it is, because the branch's committed `.bitmap` carries the lane pointer written by the
      // previous sync and `resetToRemoteBranch` just loaded that file. If it doesn't (an untracked
      // `.bitmap`, a hand-edited branch, a failed reload), the merge would silently resolve to main's
      // heads and write main's content over the dev work — so refuse and let a human look.
      const target = await lanes.parseLaneId(laneIdStr);
      const current = await lanes.getCurrentLane();
      if (current?.name !== target.name || current?.scope !== target.scope) {
        return {
          conflicts: [],
          error: new Error(
            `the branch's .bitmap points at "${current ? `${current.scope}/${current.name}` : 'main'}" ` +
              `rather than ${laneIdStr}, so the lane's snaps cannot be merged into the branch's working tree`
          ),
        };
      }

      logger.console(
        chalk.blue(`Merging lane ${laneIdStr} into the branch's working tree (bit checkout head --manual)`)
      );
      // `checkoutByCLIValues` (rather than `checkout`) because it runs `importer.importCurrentObjects()`
      // first, which fetches the remote lane object and its new components — without it, `head` would
      // resolve to the lane heads this workspace already had, i.e. to no merge at all.
      const results = await lanes.checkout.checkoutByCLIValues('', {
        head: true,
        // 'manual' writes conflict markers and reports the files as conflicted instead of prompting or
        // silently picking a side. We detect the conflicts below and halt.
        mergeStrategy: 'manual',
        promptMergeOptions: false,
        skipNpmInstall: true,
        workspaceOnly: false,
      });

      const conflicts = (results.components || [])
        .filter((comp) => Object.values(comp.filesStatus || {}).some(isConflictFileStatus))
        .map((comp) => comp.id.toStringWithoutVersion());
      // Belt and braces: `leftUnresolvedConflicts` is bit's own summary flag. If it disagrees with the
      // per-file scan, trust it — a missed conflict would get exported as if it were resolved.
      if (!conflicts.length && results.leftUnresolvedConflicts) conflicts.push('(component not reported)');
      return { conflicts };
    } catch (e: any) {
      return { conflicts: [], error: e instanceof Error ? e : new Error(String(e?.message ?? e)) };
    }
  }

  /**
   * Check `branch` out at `startPoint` (a remote-tracking ref) and reload the `.bitmap` it brings.
   *
   * `-f` is not optional. Without it a single tracked modification left in the workspace — by an
   * earlier lane in the same `--all` run, by a warn-only `restoreWorkspace`, or by a developer running
   * this interactively — makes git refuse with "local changes would be overwritten", and the lane
   * *aborts* instead of halting. Nothing is lost: `bit ci sync` announces up front that it discards
   * uncommitted changes, and this is only ever a checkout — the executor never force-pushes.
   *
   * The reload is the same invariant `resetToRemoteBranch` documents: the git checkout swaps `.bitmap`
   * on disk, and until the workspace re-reads it, every following bit operation resolves "current lane"
   * and per-component versions against the checkout the process started on.
   *
   * (`resetToRemoteBranch` cannot simply call this: its `cleanUntrackedScoped` has to run *between* the
   * checkout and the reload, so the merge that follows sees neither stale files nor a stale `.bitmap`.)
   */
  private async checkoutFromRemote(branch: string, startPoint: string) {
    await git.raw(['checkout', '-f', '-B', branch, startPoint]);
    await this.deps.ci.reloadWorkspaceFromDisk();
  }

  /**
   * Put both sides back exactly on the fetched branch tip: the working tree and `.bitmap` in git, and
   * the workspace's in-memory view of that `.bitmap`.
   *
   * The checkout is forced because a merge (or a failed attempt) may have left rewritten component
   * files and a rewritten `.bitmap`; the clean then removes whatever files that merge *added*, which
   * are untracked and so survive a checkout. The clean is scoped — see `cleanUntrackedScoped`, which
   * documents why `.bit` and `node_modules` must be excluded.
   *
   * Nothing is lost: everything worth keeping is on `origin/<branch>` already, and this is a checkout —
   * the executor never force-pushes.
   *
   * The reload is what makes the following bit operation see the *branch's* `.bitmap` (its lane pointer
   * and its per-component versions) instead of the one this process loaded at startup, which is the
   * default branch's. Without it a merge into the branch's working tree would silently resolve
   * "current lane" and "which versions am I on" against the wrong checkout.
   */
  private async resetToRemoteBranch(branch: string) {
    await git.raw(['checkout', '-f', '-B', branch, `origin/${branch}`]);
    await cleanUntrackedScoped();
    await this.deps.ci.reloadWorkspaceFromDisk();
  }

  /** The lane is gone from bit.cloud — close its PR and retire the branch. */
  private async executeClosePr({
    laneName,
    laneIdStr,
    branch,
    pr,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    pr?: PrInfo;
  }): Promise<string> {
    const { logger, gitHost } = this.deps;
    if (gitHost && pr) {
      logger.console(chalk.blue(`Closing PR #${pr.number} for removed lane ${laneIdStr}`));
      await gitHost.closePr(pr.number, `Lane ${laneIdStr} was removed/archived on bit.cloud.`);
    } else if (gitHost) {
      // Not an error: the PR may have been merged or closed by hand already, or never existed. Say so
      // explicitly, otherwise the run looks like it silently skipped the PR half of the cleanup.
      logger.console(chalk.yellow(`No open PR found for ${branch} — only retiring the branch`));
    } else {
      logger.console(chalk.yellow(`No configured git host provider — skipping PR close for ${branch}`));
    }

    // Deleting the remote branch is best-effort: it may be protected, or a human may have already
    // removed it. Neither is a reason to fail the whole sync run.
    let branchDeleted = true;
    try {
      await git.push(['origin', '--delete', branch]);
    } catch (e: any) {
      branchDeleted = false;
      logger.consoleWarning(`Could not delete remote branch ${branch}: ${e?.message || e}`);
    }
    return `${laneName} -> close-pr (${pr ? `PR #${pr.number} closed` : 'no open PR'}, branch ${branch} ${
      branchDeleted ? 'deleted' : 'left in place'
    })`;
  }

  /**
   * Hand the lane back to a human: label the PR so subsequent runs skip it (the planner treats
   * `bit-sync-conflict` as a hard no-op) and comment the resolution steps.
   */
  private async executeHalt({
    laneName,
    laneIdStr,
    branch,
    reason,
    pr,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    reason: string;
    pr?: PrInfo;
  }): Promise<string> {
    const { logger, gitHost } = this.deps;
    logger.console(chalk.red(`Cannot sync lane ${laneIdStr} automatically: ${reason}`));
    if (gitHost && pr) {
      try {
        await gitHost.addLabel(pr.number, CONFLICT_LABEL);
        await gitHost.comment(pr.number, haltCommentBody({ reason, branch, laneId: laneIdStr }));
      } catch (e: any) {
        // The halt itself is the outcome that matters; failing to annotate the PR must not replace
        // the real reason with a git-host API error.
        logger.consoleWarning(`Failed to annotate PR #${pr.number} with the sync conflict: ${e?.message || e}`);
      }
    } else if (gitHost) {
      // Not an error — the lane may never have had a PR, or a human may have closed it. Say so
      // explicitly (same three-way shape as `executeClosePr`), otherwise the halt looks like it silently
      // skipped the annotation half and the label that suppresses the next run is nowhere to be found.
      logger.console(chalk.yellow(`No open PR found for ${branch} — the halt is recorded in this run's summary only`));
    } else {
      logger.console(chalk.yellow(`No configured git host provider — skipping conflict label/comment for ${branch}`));
    }
    return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
  }

  /**
   * Drive the workspace's *filesystem* to the remote lane's content. This is the import-lane
   * direction, where the lane is the source of truth and the branch is the mirror — the opposite of
   * `bit ci pr`, where the git checkout is the source of truth and the lane is the mirror. Returns
   * the error instead of throwing, so the caller can turn a failure into a halt.
   *
   * Two traps in `CiMain.switchToLane` make a plain call insufficient here:
   *
   * 1. It defaults to `forceOurs: true`, which is right for `bit ci pr` (keep the PR's working tree)
   *    and catastrophic for us. `applyVersion` checks `forceOurs` *first* and short-circuits: every
   *    file is marked `unchanged`, the filesystem is never touched, and only `.bitmap` ids move. The
   *    result would be a `.bitmap`-only commit carrying a `Bit-Lane-Head` trailer that claims the
   *    branch mirrors the lane. Worse, that same short-circuit throws
   *    `applyVersion expect to get componentFromFS for <id>` for any lane component this branch's
   *    `.bitmap` doesn't already have. So `forceOurs` must be cleared *explicitly* (the option spread
   *    in `switchToLane` puts caller options last, so this override does take effect), and
   *    `forceTheirs` set — it writes the model's files and tolerates `componentFromFS === undefined`.
   *
   * 2. `switchLanes` throws "already checked out" from `throwForSwitchingToCurrentLane` *before* doing
   *    any work, and `switchToLane` reports that as success. Switching onto the lane we already sit on
   *    therefore materializes nothing while looking like it worked — which happens whenever the
   *    process starts on that lane or a previous warn-only `restoreWorkspace` failed. We step off to
   *    main first so the real switch always runs. (`bit checkout head`, which that error message
   *    suggests, is NOT sufficient: `ensureCheckoutConfiguration` derives its ids from
   *    `workspace.listIds()`, so a lane component missing from this branch's `.bitmap` is silently
   *    skipped. `switchLanes` instead takes its ids from the lane object itself.)
   */
  private async materializeLane(laneIdStr: string): Promise<Error | undefined> {
    const { logger } = this.deps;
    const target = await this.deps.lanes.parseLaneId(laneIdStr);
    // Compare name AND scope, so a same-named lane in another scope can't masquerade as our lane
    // (same probe `snapAndExportReusingLane` uses).
    const isOnTarget = async () => {
      const current = await this.deps.lanes.getCurrentLane();
      return current?.name === target.name && current?.scope === target.scope;
    };

    if (await isOnTarget()) {
      logger.console(
        chalk.yellow(`Workspace is already on ${laneIdStr} — stepping off to main so the re-import actually runs`)
      );
      const toMainErr = await this.deps.ci.switchToLaneForSync('main');
      if (toMainErr) return toMainErr;
      if (await isOnTarget()) {
        return new Error(`unable to leave lane ${laneIdStr} before re-importing it; the workspace is still on it`);
      }
    }

    const switchErr = await this.deps.ci.switchToLaneForSync(laneIdStr, { forceOurs: false, forceTheirs: true });
    if (switchErr) return switchErr;

    // `switchToLane` swallows "already checked out" as success, and a switch can also land somewhere
    // unexpected. Verify before the caller commits a trailer asserting this lane's content.
    if (!(await isOnTarget())) {
      const current = await this.deps.lanes.getCurrentLane();
      return new Error(
        `switching to lane ${laneIdStr} reported success but the workspace is on "${current?.name ?? 'main'}"`
      );
    }
    return undefined;
  }

  private async fetchOnce() {
    if (this.fetched) return;
    await git.fetch(['origin']);
    this.fetched = true;
  }

  /**
   * The remote lane's data, or undefined when the lane no longer exists on bit.cloud. Query by name
   * so the remote doesn't have to enumerate every lane in the scope.
   */
  private async getRemoteLane(laneName: string): Promise<LaneData | undefined> {
    const { defaultScope } = this.deps;
    const lanes = await this.deps.lanes.getLanes({ remote: defaultScope, name: laneName }).catch((e) => {
      // "was not found" is the remote's way of saying the lane is gone — that's a legitimate state
      // (it drives the close-pr path), not an error.
      if (e.toString().includes('was not found')) return [];
      throw new Error(`Failed to read lane ${defaultScope}/${laneName} from the remote: ${e.toString()}`);
    });
    return lanes[0];
  }

  /**
   * The open PR for the branch, if any. A git-host API hiccup degrades to "no PR known" rather than
   * failing the lane: without the PR we lose the `bit-sync-conflict` check and PR bookkeeping, but
   * the git side of the sync is still correct and the next run re-reads the PR.
   */
  private async findPr(branch: string): Promise<PrInfo | undefined> {
    const { gitHost, logger } = this.deps;
    if (!gitHost) return undefined;
    try {
      return await gitHost.findPrByBranch(branch);
    } catch (e: any) {
      logger.consoleWarning(`Could not look up the PR for ${branch}: ${e?.message || e}`);
      return undefined;
    }
  }

  /**
   * The subject of the newest commit on the branch that isn't one of our own sync commits — it's
   * the developer's own description of the change, and becomes the snap message on the lane.
   */
  private async lastNonSyncCommitMessage(branch: string, defaultBranch: string): Promise<string> {
    const log = await git.log([`origin/${branch}`, '--max-count=200']);
    const entry = log.all.find((item) => {
      const message = item.body ? `${item.message}\n\n${item.body}` : item.message;
      return !isSyncCommitMessage(message);
    });
    return entry?.message || `chore: sync ${branch} into the lane (from ${defaultBranch})`;
  }

  /**
   * Stage everything, commit with the sync trailer, and push. Never force-pushes: the branch is
   * always fast-forwarded from the state we just checked out, so a rejected push means someone
   * pushed concurrently and the next run should re-plan from the new state rather than clobber it.
   *
   * `--allow-empty` matters: when the lane's materialized files happen to be byte-identical to
   * what the branch already has, there's nothing to stage — but we still need the trailer commit,
   * because it is the *only* record that this lane state has been synced. Without it every
   * subsequent run would re-plan the same import.
   */
  private async commitAllAndPush(branch: string, message: string) {
    await ensureGitIdentity();
    await addAllExceptScopeAndModules();
    await git.commit(message, undefined, { '--allow-empty': null });
    await git.push('origin', branch);
    this.deps.logger.console(chalk.green(`Pushed ${branch}`));
  }

  private async openPrForLane({
    laneName,
    laneIdStr,
    branch,
    defaultBranch,
    laneHead,
    remoteLane,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
    laneHead: string;
    remoteLane: LaneData;
  }): Promise<string | undefined> {
    const { gitHost, logger, defaultScope } = this.deps;
    if (!gitHost) {
      logger.console(chalk.yellow(`No configured git host provider — skipping PR creation for ${branch}`));
      return undefined;
    }
    const laneUrl = `https://${getCloudDomain()}/${defaultScope.replace('.', '/')}/~lane/${laneName}`;
    const components = remoteLane.components
      .map((comp) => `- \`${comp.id.toStringWithoutVersion()}\` @ \`${comp.head.slice(0, 9)}\``)
      .join('\n');
    const body = [
      `Mirrors the Bit lane [\`${laneIdStr}\`](${laneUrl}) onto \`${branch}\`.`,
      '',
      `- lane: ${laneUrl}`,
      `- lane head: \`${laneHead}\``,
      '',
      `Components on the lane (${remoteLane.components.length}):`,
      components || '_none_',
      '',
      'This PR is maintained by `bit ci sync` — push to the branch to send changes back to the lane.',
    ].join('\n');
    try {
      const created = await gitHost.createPr({
        head: branch,
        base: defaultBranch,
        title: `Lane sync: ${laneIdStr}`,
        body,
      });
      logger.console(chalk.green(`Opened PR ${created.htmlUrl} for lane ${laneIdStr}`));
      return created.htmlUrl;
    } catch (e: any) {
      // The branch is already pushed, which is the load-bearing half of the import. A failed PR
      // creation (permissions, a PR that exists but wasn't visible to our query, …) shouldn't undo
      // that or fail the lane — the next run retries.
      logger.consoleWarning(`Could not open a PR for ${branch}: ${e?.message || e}`);
      return undefined;
    }
  }

  /**
   * Put the workspace back where a subsequent lane (or the developer running this interactively)
   * expects it: on main, with the default branch checked out. Mirrors
   * `CiMain.restoreWorkspaceAfterPr` semantics — best-effort, warn-only, so a restore hiccup can't
   * throw out of a `finally` and mask the real error.
   *
   * The git checkout is forced because switching the lane back to main rewrites `.bitmap`, which
   * would otherwise block the checkout with "local changes would be overwritten". Everything worth
   * keeping was committed and pushed before we get here. This is a checkout, never a push — no
   * remote state is discarded.
   *
   * The clean is what discards the files this lane *materialized* rather than modified — a lane
   * component that isn't on the default branch is written as an **untracked** directory, which a
   * checkout leaves in place. On the pushed paths they were committed and the forced checkout removes
   * them by itself, but a lane that halted after materializing never committed anything, so without the
   * clean its component files survive into the *next* lane of an `--all` run, get staged by that lane's
   * `git add -A`, and land on that lane's branch under its `Bit-Lane-Head` trailer — content the trailer
   * does not describe. `MainSyncExecutor.restoreWorkspace` cleans for the same reason; the two restores
   * must not diverge. The clean is scoped (see `cleanUntrackedScoped`).
   *
   * The `.bitmap` reload after the checkout is what makes the restore complete for the *next* lane in a
   * multi-lane run: the checkout swaps `.bitmap` on disk, and without reloading it the live workspace
   * would keep the previous lane's branch state (`merge-diverged` deliberately loads a branch's
   * `.bitmap` into the process, so this is not hypothetical) and would then resolve "current lane" and
   * per-component versions for the next lane against the wrong checkout.
   */
  private async restoreWorkspace(defaultBranch: string) {
    const { logger } = this.deps;
    try {
      const currentLane = await this.deps.lanes.getCurrentLane();
      if (currentLane) {
        const switchErr = await this.deps.ci.switchToLaneForSync('main');
        if (switchErr) logger.consoleWarning(`Could not switch the workspace back to main: ${switchErr.message}`);
      }
      await git.raw(['checkout', '-f', defaultBranch]);
      await cleanUntrackedScoped();
      await this.deps.ci.reloadWorkspaceFromDisk();
    } catch (e: any) {
      logger.consoleWarning(`Could not restore the workspace after sync: ${e?.message || e}`);
    }
  }
}

/**
 * Whether a `filesStatus` entry from a checkout/merge result represents a conflict a human must
 * resolve. Compared against `FileStatus` rather than string literals because its values are
 * chalk-colored labels (`chalk.red('CONFLICT')`), not the keys the `FilesStatus` type suggests.
 * `deletedConflict` is included on top of the pair `merge-lanes` checks — a file deleted on one side
 * and modified on the other is no less a conflict.
 */
function isConflictFileStatus(status: string): boolean {
  return status === FileStatus.manual || status === FileStatus.binaryConflict || status === FileStatus.deletedConflict;
}

/** exact resolution instructions posted on a halted PR (kept verbatim; only the fields interpolate) */
function haltCommentBody({ reason, branch, laneId }: { reason: string; branch: string; laneId: string }): string {
  return `bit-git-sync could not reconcile this branch automatically: ${reason}

To resolve locally:
  git fetch origin && git checkout ${branch}
  bit lane import ${laneId}
  # resolve conflicts, commit the result, then:
  git push origin ${branch}

Remove the \`bit-sync-conflict\` label to resume syncing.
`;
}
