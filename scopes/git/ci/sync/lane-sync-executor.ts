import chalk from 'chalk';
import { formatWarningSummary } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import type { LaneData } from '@teambit/legacy.scope';
import { getCloudDomain } from '@teambit/legacy.constants';
import { FileStatus, type MergeStrategy } from '@teambit/component.modules.merge-helper';
import { git } from '../git';
import type { CiMain } from '../ci.main.runtime';
import type { CiSyncConfig, LaneTarget } from './sync-config';
import { laneNameToBranch } from './sync-config';
import type { BranchSyncState } from './sync-state';
import {
  CONFLICT_LABEL,
  SYNC_COMMIT_MARKER,
  branchStateFingerprint,
  buildSyncCommitMessage,
  fingerprintIdVersions,
  readBranchSyncState,
  hasSyncMarker,
  isSyncAuthoredMessage,
} from './sync-state';
import { currentLaneIdStr, ensureCurrentLaneObject } from './workspace-lane';
import type { GitHostProvider, PrInfo } from './git-host-provider';
import type { BranchKeepReason, LaneOwnershipEvidence, LaneSyncAction } from './sync-planner';
import { planLaneSync } from './sync-planner';
import {
  addAllExceptScopeAndModules,
  branchExistsOnRemote,
  checkoutPristine,
  checkoutPristineRestore,
  commitWithIdentity,
  deleteBranchArgs,
  fetchRemoteHeads,
  isAncestor,
  isStaleLeaseRejection,
  refetchBranchTip,
} from './git-ops';

/**
 * Prefix of the summary line for a lane that could not be reconciled. `syncLane` deliberately does
 * NOT throw on halt — one unreconcilable lane must not abort the rest of the run; the command layer
 * scans for this prefix to decide the exit code.
 */
export const HALT_SUMMARY_PREFIX = 'HALTED';

/**
 * Prefix for a target the reconciler refuses. Unlike a halt, nothing is mid-flight and no PR is
 * annotated — the run exits non-zero, but the command layer reports a plain refusal rather than a
 * sync conflict.
 */
export const REFUSED_SUMMARY_PREFIX = 'REFUSED';

export type LaneSyncDeps = {
  lanes: LanesMain;
  /** for snapPrCommit + getDefaultBranchName + switchToLaneForSync */
  ci: CiMain;
  logger: Logger;
  /** undefined => PR operations are logged and skipped; the git half of the sync still runs. */
  gitHost?: GitHostProvider;
  cfg: Required<CiSyncConfig>;
  defaultScope: string;
};

/**
 * Fingerprint of a lane's content — same primitive as `branchStateFingerprint`, so "equal" means
 * exactly "the branch records every lane component at the lane's head".
 *
 * We deliberately do NOT use `LaneData.hash`: that hash is minted randomly at lane-creation time
 * and does not change when the lane's components advance. This is derived from content instead.
 */
export function laneHeadFingerprint(components: LaneData['components']): string {
  return fingerprintIdVersions(components.map((comp) => `${comp.id.toStringWithoutVersion()}@${comp.head}`));
}

/** The lane's component ids, without versions — the id set `branchStateFingerprint` reads off the branch. */
function laneComponentIds(components: LaneData['components']): string[] {
  return components.map((comp) => comp.id.toStringWithoutVersion());
}

/**
 * The lane's components that do not belong to `defaultScope`. A lane may span scopes, and the
 * reconciler acts on a lane whole (fingerprint, materialize, snap, export), so foreign content is
 * refused rather than written into this repository. Soft-deleted components and `updateDependents`
 * entries are deliberately not read — the reconciler never materializes or exports them either.
 */
export function foreignLaneComponents(components: LaneData['components'], defaultScope: string): string[] {
  return components.filter((comp) => comp.id.scope !== defaultScope).map((comp) => comp.id.toStringWithoutVersion());
}

/** How many foreign component ids a cross-scope message names before it summarizes the rest. */
const MAX_LISTED_FOREIGN_COMPONENTS = 5;

/**
 * How many component ids a PR body or comment enumerates before summarizing the rest. GitHub caps a
 * PR body / issue comment at 65,536 characters and rejects the whole request over it.
 */
const MAX_LISTED_COMPONENTS = 20;

/**
 * `entries`, capped at `max`, with a final "…and K more" entry. The bound is on entries, not rendered
 * length, so a markdown list is never cut mid-line. `overflowPrefix` carries the caller's list marker
 * onto the summary line.
 */
export function capEntries(entries: string[], overflowPrefix = '', max: number = MAX_LISTED_COMPONENTS): string[] {
  if (entries.length <= max) return entries;
  return [...entries.slice(0, max), `${overflowPrefix}…and ${entries.length - max} more`];
}

/** The shared clause describing why a lane is cross-scope, used by the skip/refusal/halt outcomes. */
export function crossScopeDescription(foreignIds: string[], defaultScope: string): string {
  // The scope is everything before the FIRST '/': a component id is `<scope>/<namespace…>/<name>`.
  const scopes = [...new Set(foreignIds.map((id) => id.split('/', 1)[0]))].sort();
  const sample = capEntries(foreignIds, '', MAX_LISTED_FOREIGN_COMPONENTS).join(', ');
  return (
    `components from scope(s) ${scopes.join(', ')} (this repo maps scope ${defaultScope}); ` +
    `foreign components: ${sample}`
  );
}

/**
 * A cross-scope lane that was merely enumerated: a skip, and the run stays green — a standing, valid
 * lane must not turn every scheduled run permanently red.
 */
export function crossScopeSkipSummary(laneName: string, foreignIds: string[], defaultScope: string): string {
  return (
    `${laneName} -> skipped (cross-scope lane: ${crossScopeDescription(foreignIds, defaultScope)} — ` +
    `no branch created; see the docs' Cross-scope lanes section)`
  );
}

/**
 * A cross-scope lane the user named explicitly: exits non-zero with the explanation. A refusal, not a
 * halt — no PR is labelled, no branch is written. `existingBranch` keeps the closing sentence truthful
 * when a branch of that name already exists.
 */
export function crossScopeRefusal(foreignIds: string[], defaultScope: string, existingBranch?: string): string {
  const outcome = existingBranch
    ? `Nothing was written; the existing branch ${existingBranch} was left untouched`
    : 'No branch was created and nothing was written';
  return (
    `cross-scope lane: ${crossScopeDescription(foreignIds, defaultScope)}; syncing cross-scope lanes is ` +
    `not supported yet — see the docs' Cross-scope lanes section. ${outcome}`
  );
}

/**
 * Halt reason for a branch that is the live mirror of a different lane — two lanes with the same name
 * in different scopes map to the same branch. Names both ids so the human can tell which owns it.
 */
export function branchMirrorsOtherLaneReason(branch: string, mirroredLaneIdStr: string, laneIdStr: string): string {
  return (
    `branch ${branch} mirrors lane ${mirroredLaneIdStr}; refusing to plan for ${laneIdStr} — two lanes ` +
    `with the same name in different scopes map to the same branch, and reconciling this one would ` +
    `overwrite the other lane's mirror`
  );
}

/**
 * PR comment for the branch-aliasing halt — the one halt whose PR belongs to a DIFFERENT lane. It must
 * not carry the default "import the lane" steps, which would perform the overwrite the halt prevented.
 */
export function branchMirrorsOtherLaneNote(mirroredLaneIdStr: string, laneIdStr: string): string {
  return `This pull request belongs to lane \`${mirroredLaneIdStr}\`, and nothing is wrong with it.

Lane \`${laneIdStr}\` has the same lane *name* in a different scope, so it maps to this same branch, and \
\`bit ci sync\` refused to reconcile it here rather than overwrite this branch with the other lane's content.
Both lanes stay unsynced until the collision is resolved: rename one of the two lanes, or map one of them to \
a different branch via the \`branches\` option of the \`teambit.git/ci\` sync config.

Do NOT run the usual "bit lane import" resolution steps on this branch — they would import \
\`${laneIdStr}\` over \`${mirroredLaneIdStr}\`'s mirror.`;
}

/**
 * A lane that became cross-scope after this repository had already mirrored it onto a branch — the one
 * cross-scope shape that is a genuine halt: the pair is mid-flight and can no longer converge.
 */
export function crossScopeMidFlightHaltReason(branch: string, foreignIds: string[], defaultScope: string): string {
  return (
    `lane became cross-scope after it was mirrored onto ${branch}: ${crossScopeDescription(foreignIds, defaultScope)}; ` +
    `the branch and the lane can no longer be reconciled automatically — see the docs' Cross-scope lanes section`
  );
}

/**
 * Branches `executeClosePr` refuses to delete whatever the ownership evidence concluded — an
 * unconditional guard at the one site that deletes remote branches.
 */
export function isProtectedBranch(branch: string, defaultBranch: string, mainSyncBranch: string): boolean {
  return branch === defaultBranch || branch === mainSyncBranch;
}

/**
 * The summary line a dry run reports for a planned action. A planned halt carries the same prefix the
 * real run would: `summarizeSync` recognizes that prefix and nothing else, so without it a `--dry-run`
 * exits 0 on a plan that needs a human. Refusals never reach here — they are returned before planning.
 */
export function dryRunSummaryLine(laneName: string, action: LaneSyncAction): string {
  return action.type === 'halt'
    ? `${HALT_SUMMARY_PREFIX} ${laneName} -> ${action.reason}`
    : `${laneName} -> ${action.type}`;
}

/** Why each `BranchKeepReason` withheld the deletion — one wording for the PR comment and the summary. */
export const KEPT_BECAUSE: Record<BranchKeepReason, string> = {
  'unmerged-commits': `it carries commits that are not in the default branch`,
  'tip-not-a-sync-commit': `its tip is not one of this reconciler's own commits, so the work in it may exist nowhere else`,
  'tip-advanced-during-run': `its tip advanced after the ownership evidence was read, so it may carry work this run never saw`,
};

export class LaneSyncExecutor {
  constructor(private deps: LaneSyncDeps) {}

  /** Every `origin/<ref>` read assumes current remote refs; fetch once per executor, not per lane. */
  private fetched = false;

  /**
   * Reconcile one lane with its git branch/PR. Returns a summary line (HALT/REFUSED prefixed on
   * failure) and NEVER throws — the contract the `--all` loop is written against, for every failure
   * mode: the steps route expected failures to `executeHalt`, this wrapper covers the unexpected ones.
   */
  async syncLane(
    target: LaneTarget,
    opts: {
      dryRun?: boolean;
      /** The user named this lane on the command line; decides how a cross-scope lane is reported. */
      explicitTarget?: boolean;
    } = {}
  ): Promise<string> {
    const { cfg, logger } = this.deps;
    const laneName = target.name;
    const laneIdStr = `${target.hostScope}/${laneName}`;
    // Declared outside the try so the catch can tell "reconciling failed" from "the name never mapped
    // to a branch". The mapping must run INSIDE the try: `laneNameToBranch` throws on a lane name git
    // cannot accept as a ref, and this method's contract is that it never throws.
    let branch: string | undefined;
    try {
      // The branch mapping is by lane NAME only; everything addressed to bit uses the lane's real id.
      branch = laneNameToBranch(laneName, cfg);
      return await this.reconcileLane({
        target,
        laneIdStr,
        branch,
        dryRun: opts.dryRun,
        explicitTarget: opts.explicitTarget,
      });
    } catch (e: any) {
      const reason = `unexpected error: ${e?.message || e}`;
      // No branch => nothing to annotate: report-only, but still HALT-prefixed so the run exits non-zero.
      if (branch === undefined) {
        logger.console(formatWarningSummary(`Cannot sync lane ${laneIdStr}: ${reason}`));
        return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
      }
      // This catch fires for exceptions thrown before `reconcileLane`'s own dry-run handling gets a
      // say; without the guard an early crash would label a PR on a run that promised no writes.
      if (opts.dryRun) {
        return this.haltOrReport({ laneName, laneIdStr, branch, reason, dryRun: true });
      }
      try {
        return await this.executeHalt({ laneName, laneIdStr, branch, reason, pr: await this.findPr(branch) });
      } catch (haltError: any) {
        // The halt itself failed; throwing here would abort the remaining lanes, so report and move on.
        logger.error(`bit ci sync: failed to halt lane ${laneIdStr}`, haltError);
        logger.consoleWarning(`Could not record the halt of lane ${laneIdStr}: ${haltError?.message || haltError}`);
        return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
      }
    }
  }

  private async reconcileLane({
    target,
    laneIdStr,
    branch,
    dryRun,
    explicitTarget,
  }: {
    target: LaneTarget;
    laneIdStr: string;
    branch: string;
    dryRun?: boolean;
    explicitTarget?: boolean;
  }): Promise<string> {
    const { logger, defaultScope, cfg } = this.deps;
    const laneName = target.name;

    await this.fetchOnce();

    const defaultBranch = await this.deps.ci.getDefaultBranchName();

    // RESERVED BRANCHES: a `branches` override can map a lane onto the default or main-sync branch,
    // and the lane path would then commit and push to a branch only the main-scope path may own. The
    // guard lives here because this is the single funnel every trigger passes through.
    if (isProtectedBranch(branch, defaultBranch, cfg.mainSyncBranch)) {
      const reason =
        `lane ${laneIdStr} maps to ${branch}, which is ` +
        `${branch === defaultBranch ? "the repository's default branch" : 'the main sync branch maintained by this command'}; ` +
        `the main scope is reconciled by "bit ci sync --main", never as a lane. Nothing was written`;
      if (explicitTarget) {
        logger.console(formatWarningSummary(`Cannot sync lane ${laneIdStr}: ${reason}`));
        return `${REFUSED_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
      }
      const summary = `${laneName} -> skipped (${reason})`;
      logger.console(formatWarningSummary(summary));
      return summary;
    }

    const remoteLane = await this.getRemoteLane(target);

    const laneHead = remoteLane ? laneHeadFingerprint(remoteLane.components) : undefined;
    const branchExists = await branchExistsOnRemote(branch);
    const branchState: BranchSyncState = branchExists
      ? await readBranchSyncState(branch, defaultBranch, defaultScope)
      : { stateCommit: undefined, bitmap: undefined, hasDevCommits: false, tipMessage: '' };
    if (hasSyncMarker(branchState.tipMessage)) {
      logger.console('branch tip is a bit-sync commit; reconciler will no-op unless the lane moved');
    }

    // Read before any refusal below: every halt must be suppressible by the conflict label, or a
    // standing problem re-comments on the same PR on every scheduled run.
    const pr = await this.findPr(branch);
    const conflictLabelPresent = pr?.labels.includes(CONFLICT_LABEL) ?? false;
    const suppressedByLabel = `${laneName} -> noop (PR is labeled ${CONFLICT_LABEL}; resolve and remove the label to resume)`;

    // Which lane, if any, this branch is the LIVE mirror of. Attribution (the `.bitmap` lane pointer)
    // alone proves nothing: a merged sync PR's state is inherited by every branch cut from the default
    // branch afterwards. Only a state commit the default branch does not contain says "mirror, now".
    const mirroredLane = branchState.bitmap?.laneIdStr;
    const claim: LaneOwnershipEvidence =
      mirroredLane && branchState.stateCommit
        ? await this.assessBranchOwnership({ branch, defaultBranch, stateCommit: branchState.stateCommit })
        : 'inherited-or-none';
    const mirroredLaneIdStr = claim === 'own-live' ? mirroredLane : undefined;

    // TWO LANES, ONE BRANCH: the mapping is keyed on the lane NAME, so same-named lanes in different
    // scopes collide. Planning against another lane's live mirror would hijack it — halt instead.
    // Only when this lane exists: with no lane, `close-pr` already refuses without attribution, and
    // halting a branch this repository cannot resolve would leave a permanently red run with no PR.
    if (laneHead && mirroredLaneIdStr && mirroredLaneIdStr !== laneIdStr) {
      if (conflictLabelPresent) return suppressedByLabel;
      // The PR annotated here belongs to `mirroredLaneIdStr`, the lane that owns this branch;
      // `commentNote` tells its reviewers why a label appeared on a PR whose own lane is healthy.
      return this.haltOrReport({
        laneName,
        laneIdStr,
        branch,
        reason: branchMirrorsOtherLaneReason(branch, mirroredLaneIdStr, laneIdStr),
        pr,
        dryRun,
        commentNote: branchMirrorsOtherLaneNote(mirroredLaneIdStr, laneIdStr),
      });
    }

    // A cross-scope lane cannot be reconciled here — the reconciler acts on a lane whole, so mirroring
    // one would write another repository's components into this one. The check lives in the executor
    // because every trigger funnels through here, and it needs the lane's content.
    const foreign = remoteLane ? foreignLaneComponents(remoteLane.components, defaultScope) : [];
    if (foreign.length) {
      return this.crossScopeOutcome({
        laneName,
        laneIdStr,
        branch,
        branchExists,
        foreign,
        midFlight: mirroredLaneIdStr === laneIdStr,
        explicit: Boolean(explicitTarget),
        conflictLabelPresent,
        suppressedByLabel,
        pr,
        dryRun,
      });
    }
    // Attribution to THIS lane is required: the claim was computed for whichever lane the branch's
    // `.bitmap` names, and a claim on someone else's behalf licenses nothing here.
    const laneIsGone = branchExists && !laneHead;
    const ownership: LaneOwnershipEvidence = laneIsGone && mirroredLane === laneIdStr ? claim : 'inherited-or-none';

    // What the branch reflects, read off its own `.bitmap` — only when that `.bitmap` names THIS lane;
    // otherwise the planner's `!lastSyncedHead` rows handle "no state of ours".
    const lastSyncedHead =
      remoteLane && branchState.bitmap && mirroredLane === laneIdStr
        ? branchStateFingerprint(branchState.bitmap, laneComponentIds(remoteLane.components))
        : undefined;

    // `isSyncAuthoredMessage`, NOT `hasSyncMarker`: this feeds a branch deletion, and a message that
    // merely quotes the marker must not read as one we wrote.
    const tipIsSyncCommit = isSyncAuthoredMessage(branchState.tipMessage);

    const action = planLaneSync({
      laneHead,
      branchExists,
      lastSyncedHead,
      hasDevCommits: branchState.hasDevCommits,
      tipIsSyncCommit,
      conflictLabelPresent,
      ownership,
    });

    logger.console(
      chalk.blue(
        `${laneName} -> ${action.type} (branch: ${branch}, lane head: ${laneHead?.slice(0, 9) ?? 'none'}, ` +
          `branch state: ${lastSyncedHead?.slice(0, 9) ?? 'none'}, ` +
          `dev commits: ${branchState.hasDevCommits}${laneIsGone ? `, branch claim: ${ownership}` : ''})`
      )
    );

    if (dryRun) {
      const line = dryRunSummaryLine(laneName, action);
      logger.console(formatWarningSummary(`Dry-run: ${line}`));
      return line;
    }

    // A pair can be converged at the bit level while the tip still holds unsnapped source edits (a
    // single commit that rewrites `.bitmap` AND carries an edit is its own state commit) — say so.
    // `laneHead` must be checked explicitly: with no lane and no attribution both fingerprints are
    // undefined, and `undefined === undefined` would fire on every ordinary developer branch.
    if (
      action.type === 'noop' &&
      action.reason === 'converged' &&
      !tipIsSyncCommit &&
      laneHead &&
      lastSyncedHead === laneHead
    ) {
      logger.console(
        formatWarningSummary(
          `converged on bit state, but ${branch}'s tip is not a bit ci sync commit — any source edits it ` +
            `carries that were never snapped stay invisible until the next commit on the branch`
        )
      );
    }

    switch (action.type) {
      case 'noop':
        return `${laneName} -> noop (${action.reason})`;
      case 'import-lane':
        // The planner only emits import-lane when the lane exists, so both casts are safe.
        return this.executeImportLane({
          target,
          laneIdStr,
          branch,
          branchExists,
          defaultBranch,
          laneHead: laneHead as string,
          remoteLane: remoteLane as LaneData,
          pr,
        });
      case 'export-branch':
        // The tip is already this reconciler's own commit — it already confirmed everything up to
        // it (that is what writing it means), and `hasDevCommits`/`stateCommit` cannot tell a real
        // dev commit from one that touches no bit-tracked file (docs, CI config): `stateCommit` is
        // derived from `.bitmap`'s content, never from commit messages (sync-state.ts), so a commit
        // that leaves `.bitmap` byte-identical never advances it, however many runs re-confirm
        // "nothing to snap" on top. Recognizing our own tip here — not by loosening `hasDevCommits`
        // itself, which the ownership/retirement path also reads and must stay strict — is what
        // makes that settle instead of re-planning `export-branch` forever.
        if (tipIsSyncCommit) {
          return `${laneName} -> noop (converged; branch tip is already this reconciler's own sync commit)`;
        }
        return this.executeExportBranch({ target, laneIdStr, branch, defaultBranch });
      case 'merge-diverged':
        return this.executeMergeDiverged({ target, laneIdStr, branch, defaultBranch });
      case 'close-pr':
        return this.executeClosePr({
          laneName,
          laneIdStr,
          branch,
          defaultBranch,
          pr,
          deleteBranch: action.deleteBranch,
          keepReason: action.deleteBranch ? undefined : action.keepReason,
          expectedTipSha: branchState.tipSha,
        });
      case 'halt':
        return this.executeHalt({ laneName, laneIdStr, branch, reason: action.reason, pr });
      default: {
        // exhaustiveness guard
        const unhandled: never = action;
        throw new Error(`bit ci sync: unhandled lane sync action ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * What a cross-scope lane means for this repository: a mid-flight halt when the branch is this
   * lane's live mirror (checked first — the problem is the state of the pair, not the phrasing of the
   * request); a refusal when the user named the lane explicitly; otherwise an enumerated skip that
   * stays green — one standing cross-scope lane must not fail every scheduled run forever.
   */
  private async crossScopeOutcome({
    laneName,
    laneIdStr,
    branch,
    branchExists,
    foreign,
    midFlight,
    explicit,
    conflictLabelPresent,
    suppressedByLabel,
    pr,
    dryRun,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    branchExists: boolean;
    foreign: string[];
    midFlight: boolean;
    explicit: boolean;
    conflictLabelPresent: boolean;
    suppressedByLabel: string;
    pr?: PrInfo;
    dryRun?: boolean;
  }): Promise<string> {
    const { logger, defaultScope } = this.deps;

    if (midFlight) {
      // Self-suppression like every other halt — otherwise this would re-comment on every scheduled run.
      if (conflictLabelPresent) return suppressedByLabel;
      return this.haltOrReport({
        laneName,
        laneIdStr,
        branch,
        reason: crossScopeMidFlightHaltReason(branch, foreign, defaultScope),
        pr,
        dryRun,
      });
    }

    if (explicit) {
      const reason = crossScopeRefusal(foreign, defaultScope, branchExists ? branch : undefined);
      logger.console(formatWarningSummary(`Cannot sync lane ${laneIdStr}: ${reason}`));
      return `${REFUSED_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
    }

    const summary = crossScopeSkipSummary(laneName, foreign, defaultScope);
    logger.console(formatWarningSummary(summary));
    return summary;
  }

  /**
   * Mirror the remote lane onto the branch: check the branch out, materialize the lane into the
   * workspace, and commit the result. The committed `.bitmap` IS the record of the branch's state.
   */
  private async executeImportLane({
    target,
    laneIdStr,
    branch,
    branchExists,
    defaultBranch,
    laneHead,
    remoteLane,
    pr,
  }: {
    target: LaneTarget;
    laneIdStr: string;
    branch: string;
    branchExists: boolean;
    defaultBranch: string;
    laneHead: string;
    remoteLane: LaneData;
    pr?: PrInfo;
  }): Promise<string> {
    const { logger } = this.deps;
    const laneName = target.name;
    logger.console(chalk.blue(`Importing lane ${laneIdStr} onto branch ${branch}`));

    // A brand-new lane branch forks from the default branch; an existing one is reset to whatever
    // the remote has, so a stale local copy of the branch can never leak into the sync commit.
    const startPoint = branchExists ? `origin/${branch}` : `origin/${defaultBranch}`;
    await this.checkoutFromRemote(branch, startPoint);

    try {
      // A switch that moved the pointer without materializing the files would make every later run
      // read the pair as converged over content the branch never received — see `materializeLane`.
      const switchErr = await this.materializeLane(laneIdStr);
      if (switchErr) {
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
        prUrl = await this.openPrForLane({ target, laneIdStr, branch, defaultBranch, laneHead, remoteLane });
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
   * Push the branch's dev commits back onto the lane: snap+export the branch's tree, then commit the
   * resulting `.bitmap` back onto the branch so the next run sees the two sides as converged.
   */
  private async executeExportBranch({
    target,
    laneIdStr,
    branch,
    defaultBranch,
  }: {
    target: LaneTarget;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
  }): Promise<string> {
    const { logger } = this.deps;
    const laneName = target.name;
    logger.console(chalk.blue(`Exporting branch ${branch} onto lane ${laneIdStr}`));

    const message = await this.lastNonSyncCommitMessage(branch, defaultBranch);
    await this.checkoutFromRemote(branch, `origin/${branch}`);

    try {
      const exportErr = await this.snapAndExportOntoLane(laneIdStr, message);
      if (exportErr) {
        // Halt rather than propagate: one lane's failed snap/export must not abort the lanes after it.
        return await this.executeHalt({
          laneName,
          laneIdStr,
          branch,
          reason: `failed to snap and export branch ${branch} onto lane ${laneIdStr}: ${exportErr.message}`,
          pr: await this.findPr(branch),
        });
      }

      const laneHead = await this.recordLaneHeadOnBranch(target, laneIdStr, branch);
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
   * Both sides moved since the last sync. Order is load-bearing: (1) merge the lane into the branch's
   * working tree (`bit checkout head`; conflicts halt or auto-resolve per `sync.onConflict`), (2) snap
   * + export the merged tree — the snap IS the merge, (3) commit the resulting `.bitmap` back onto the
   * branch. The merge cannot be skipped: the export path's switch runs under `forceOurs`, which never
   * touches the filesystem, so a bare export would silently revert every lane-side file edit and then
   * assert convergence over the loss. Never throws; anything unexpected halts.
   */
  private async executeMergeDiverged({
    target,
    laneIdStr,
    branch,
    defaultBranch,
  }: {
    target: LaneTarget;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
  }): Promise<string> {
    const { logger } = this.deps;
    const laneName = target.name;
    logger.console(
      formatWarningSummary(
        `Diverged: lane ${laneIdStr} and branch ${branch} both moved since the last sync — attempting to converge`
      )
    );

    const halt = async (reason: string) =>
      this.executeHalt({ laneName, laneIdStr, branch, reason, pr: await this.findPr(branch) });

    try {
      // Force-checkout `origin/<branch>` and reload `.bitmap`: the merge depends on that file for the
      // lane pointer and the merge base, and a stale local branch must never leak into the result.
      await this.checkoutFromRemote(branch, `origin/${branch}`);

      // ---- step 1: merge the lane's snaps into the branch's working tree -----------------------
      const merge = await this.mergeLaneIntoBranchWorkingTree(laneIdStr);
      if (merge.error) {
        return await halt(`failed to merge lane ${laneIdStr} into branch ${branch}: ${merge.error.message}`);
      }
      let policyClause = '';
      if (merge.conflicts.length) {
        // Discard the conflict markers before ANY next step: a halt must not leave a half-merged tree,
        // and the policy re-merge would read markers on disk as the branch's own content.
        await this.checkoutFromRemote(branch, `origin/${branch}`);
        if (this.deps.cfg.onConflict === 'halt') {
          // Bounded: this reason is posted as the halt PR comment.
          return await halt(`merge conflicts in: ${capEntries(merge.conflicts).join(', ')}`);
        }
        // Side mapping per bit's checkout semantics: `checkout head` merges the lane's head INTO the
        // workspace, whose tree is the branch's — so 'ours' = the branch (git-wins) and 'theirs' = the
        // incoming lane head (lane-wins).
        const strategy: MergeStrategy = this.deps.cfg.onConflict === 'git-wins' ? 'ours' : 'theirs';
        logger.console(
          formatWarningSummary(
            `Merge conflicts in ${capEntries(merge.conflicts).join(', ')} — resolving by policy ` +
              `sync.onConflict "${this.deps.cfg.onConflict}" (bit merge strategy: ${strategy})`
          )
        );
        const resolved = await this.mergeLaneIntoBranchWorkingTree(laneIdStr, strategy);
        if (resolved.error) {
          return await halt(
            `failed to merge lane ${laneIdStr} into branch ${branch} under sync.onConflict ` +
              `"${this.deps.cfg.onConflict}": ${resolved.error.message}`
          );
        }
        if (resolved.conflicts.length) {
          // 'ours'/'theirs' cannot leave a conflict by construction; if bit reports one anyway,
          // exporting it as if resolved is the one unacceptable outcome — reset and halt.
          await this.checkoutFromRemote(branch, `origin/${branch}`);
          return await halt(
            `merge conflicts in ${capEntries(resolved.conflicts).join(', ')} survived the ` +
              `"${this.deps.cfg.onConflict}" auto-resolution`
          );
        }
        // The count comes from the manual pass; the policy pass no longer sees a conflict.
        policyClause = `conflicts auto-resolved: ${this.deps.cfg.onConflict} on ${merge.conflictedFileCount} file(s); `;
        logger.console(
          chalk.green(
            `Resolved ${merge.conflictedFileCount} conflicted file(s) by "${this.deps.cfg.onConflict}" — ` +
              `snapping the merged tree`
          )
        );
      } else {
        logger.console(
          chalk.green(`Merged lane ${laneIdStr} into ${branch} with no conflicts — snapping the merged tree`)
        );
      }

      // ---- step 2: snap + export the merged tree onto the lane ---------------------------------
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
      const laneHead = await this.recordLaneHeadOnBranch(target, laneIdStr, branch);
      if (!laneHead) {
        return await halt(`lane ${laneIdStr} could not be read back from the remote after the merge export`);
      }
      return (
        `${laneName} -> merge-diverged (${policyClause}merged lane into branch, then exported; lane ${laneIdStr} @ ` +
        `${laneHead.slice(0, 9)}, branch ${branch} updated)`
      );
    } catch (e: any) {
      // Something unforeseen — halt anyway: no single lane may abort the rest of the run.
      return await halt(
        `unexpected failure while reconciling diverged lane ${laneIdStr} with branch ${branch}: ${e?.message || e}`
      );
    } finally {
      await this.restoreWorkspace(defaultBranch);
    }
  }

  /**
   * Snap the workspace's current tree onto the lane and export it; returns the error so the caller can
   * halt. Snaps WHATEVER is in the workspace (the switch uses `forceOurs` and never merges files), so
   * a diverged tree must already hold the merged content. `keepLane` preserves the lane's history,
   * `skipCleanup` keeps the snap's `.bitmap` for the caller to commit, `noDestructiveRecovery` turns
   * stale-lane recovery (delete + re-fork the remote lane) into a throw. The lane object must be
   * imported BEFORE delegating: a switch onto the lane the workspace is already on no-ops before any
   * fetch, so it never warms a cold scope.
   */
  private async snapAndExportOntoLane(laneIdStr: string, message: string): Promise<Error | undefined> {
    try {
      await ensureCurrentLaneObject(this.deps.lanes);
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
   * Record on the branch which lane state it now mirrors: re-query the lane (the export just moved it,
   * so any earlier fingerprint is stale), commit — crucially the `.bitmap` the snap rewrote — and push.
   * Returns undefined when the lane can no longer be read, in which case the caller halts.
   */
  private async recordLaneHeadOnBranch(
    target: LaneTarget,
    laneIdStr: string,
    branch: string
  ): Promise<string | undefined> {
    const remoteLane = await this.getRemoteLane(target);
    if (!remoteLane) return undefined;
    const laneHead = laneHeadFingerprint(remoteLane.components);
    await this.commitAllAndPush(branch, buildSyncCommitMessage(laneIdStr, laneHead));
    return laneHead;
  }

  /**
   * Merge the lane's snaps into the branch's working tree via `bit checkout head` (three-way merge,
   * base = the branch's `.bitmap` version; `workspaceOnly` must stay false so lane-only components are
   * added). Returns conflicted ids + file count rather than throwing. Not `mergeLanes.mergeLane`: both
   * sides here are the same lane id, which `validateMergeFlags` rejects, and `mergeLane` refuses to
   * run with modified components — exactly the branch's state here.
   */
  private async mergeLaneIntoBranchWorkingTree(
    laneIdStr: string,
    mergeStrategy: MergeStrategy = 'manual'
  ): Promise<{ conflicts: string[]; conflictedFileCount: number; error?: Error }> {
    const { logger, lanes } = this.deps;
    try {
      // `checkout head` merges into the CURRENT lane; if the workspace is not on it, the merge would
      // silently resolve to main's heads and write main's content over the dev work — refuse instead.
      // `currentLaneIdStr`, NOT `lanes.getCurrentLane()`: the latter answers "main" on a cold runner.
      const target = await lanes.parseLaneId(laneIdStr);
      const current = currentLaneIdStr(lanes);
      if (current !== target.toString()) {
        return {
          conflicts: [],
          conflictedFileCount: 0,
          error: new Error(
            `the branch's .bitmap points at "${current ?? 'main'}" ` +
              `rather than ${laneIdStr}, so the lane's snaps cannot be merged into the branch's working tree`
          ),
        };
      }

      // Cold runner: the lane object may not be in this scope at all — import before the merge.
      await ensureCurrentLaneObject(lanes);

      logger.console(
        chalk.blue(
          `Merging lane ${laneIdStr} into the branch's working tree (bit checkout head ` +
            `${mergeStrategy === 'manual' ? '--manual' : `--auto-merge-resolve ${mergeStrategy}`})`
        )
      );
      // `checkoutByCLIValues` (rather than `checkout`) because it runs `importer.importCurrentObjects()`
      // first — without it, `head` would resolve to the stale lane heads this workspace already had.
      const results = await lanes.checkout.checkoutByCLIValues('', {
        head: true,
        mergeStrategy,
        promptMergeOptions: false,
        skipNpmInstall: true,
        workspaceOnly: false,
      });

      let conflictedFileCount = 0;
      const conflicts: string[] = [];
      (results.components || []).forEach((comp) => {
        const conflictedFiles = Object.values(comp.filesStatus || {}).filter(isConflictFileStatus);
        if (!conflictedFiles.length) return;
        conflictedFileCount += conflictedFiles.length;
        conflicts.push(comp.id.toStringWithoutVersion());
      });
      // If bit's own summary flag disagrees with the per-file scan, trust it — a missed conflict
      // would get exported as if it were resolved.
      if (!conflicts.length && results.leftUnresolvedConflicts) conflicts.push('(component not reported)');
      return { conflicts, conflictedFileCount };
    } catch (e: any) {
      return {
        conflicts: [],
        conflictedFileCount: 0,
        error: e instanceof Error ? e : new Error(String(e?.message ?? e)),
      };
    }
  }

  /**
   * Put the working tree on `branch` at a pristine copy of `startPoint` and reload the `.bitmap` it
   * brings (see `checkoutPristine`), so no leftover from a previous lane leaks into this lane's sync
   * commit and the following bit operation resolves against this branch's `.bitmap`. Also the recovery
   * after a merge attempt: resetting to `origin/<branch>` puts both sides back on the fetched tip.
   */
  private async checkoutFromRemote(branch: string, startPoint: string) {
    await checkoutPristine(branch, startPoint, () => this.deps.ci.reloadWorkspaceFromDisk());
  }

  /**
   * The reachability half of `LaneOwnershipEvidence`; the attribution half lives at the call site.
   * An unanswerable question resolves to `inherited-or-none` — every other answer permits deleting a
   * branch, and a failed `merge-base` is not evidence of anything. A foreign-hosted lane's branch
   * reached by branch name attributes as `inherited-or-none` (scope mismatch), which is the safe
   * direction: left alone, never retired.
   */
  private async assessBranchOwnership({
    branch,
    defaultBranch,
    stateCommit,
  }: {
    branch: string;
    defaultBranch: string;
    stateCommit: string;
  }): Promise<LaneOwnershipEvidence> {
    const { logger } = this.deps;
    try {
      if (!(await isAncestor(stateCommit, `origin/${defaultBranch}`))) return 'own-live';
      // The PR was merged. Deleting is only safe if the tip is in the default branch too; otherwise
      // work was pushed after the merge and lives nowhere else.
      if (await isAncestor(`origin/${branch}`, `origin/${defaultBranch}`)) return 'own-merged';
      return 'own-superseded';
    } catch (e: any) {
      logger.consoleWarning(
        `Could not establish whether ${branch} is already merged into ${defaultBranch}, so its ownership ` +
          `could not be determined; treating it as inherited-or-none (no branch is retired, and the branch ` +
          `is not treated as any lane's live mirror): ${e?.message || e}`
      );
      return 'inherited-or-none';
    }
  }

  /**
   * The lane is gone from bit.cloud — close its PR, and retire the branch if the claim on it allows.
   * Deleting the branch is the one irreversible thing this command does; `keepReason` distinguishes
   * "work that exists nowhere else" from "we did not write the tip".
   */
  private async executeClosePr({
    laneName,
    laneIdStr,
    branch,
    defaultBranch,
    pr,
    deleteBranch,
    keepReason,
    expectedTipSha,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
    pr?: PrInfo;
    deleteBranch: boolean;
    keepReason?: BranchKeepReason;
    /** the tip every input to the deletion decision was read from; the delete leases on it */
    expectedTipSha?: string;
  }): Promise<string> {
    const { logger, gitHost } = this.deps;
    const prClause = pr ? `PR #${pr.number} closed` : 'no open PR';

    // Every input to the deletion decision — tip-is-sync-commit, dev commits, ownership — comes from refs
    // fetched once at the start of the run, and an `--all` run can spend minutes on earlier lanes. Re-read
    // this one branch first: the evidence licensed deleting THAT commit, not whatever the branch holds now.
    let keep = keepReason;
    let deleteAt: string | undefined;
    if (deleteBranch) {
      const currentTip = expectedTipSha ? await this.currentBranchTip(branch) : undefined;
      if (currentTip && currentTip === expectedTipSha) deleteAt = currentTip;
      else {
        keep = 'tip-advanced-during-run';
        logger.consoleWarning(
          `Not retiring branch ${branch}: its tip is now ${currentTip ?? 'unreadable'} rather than the ` +
            `${expectedTipSha ?? 'unknown'} its ownership evidence was read from — it advanced during this run`
        );
      }
    }

    const keptBecause = KEPT_BECAUSE[keep ?? 'unmerged-commits'];
    const closeComment = deleteAt
      ? `Lane ${laneIdStr} was removed/archived on bit.cloud.`
      : `Lane ${laneIdStr} was removed/archived on bit.cloud. The branch \`${branch}\` is being kept: ` +
        `${keptBecause}.`;
    if (gitHost && pr) {
      logger.console(chalk.blue(`Closing PR #${pr.number} for removed lane ${laneIdStr}`));
      await gitHost.closePr(pr.number, closeComment);
    } else if (gitHost) {
      // Not an error: the PR may have been merged or closed by hand already, or never existed.
      logger.console(
        formatWarningSummary(
          `No open PR found for ${branch} — ${deleteAt ? 'only retiring the branch' : 'nothing to close'}`
        )
      );
    } else {
      logger.console(formatWarningSummary(`No configured git host provider — skipping PR close for ${branch}`));
    }

    if (!deleteAt) {
      if (keep === 'tip-not-a-sync-commit') {
        logger.console(
          formatWarningSummary(
            `lane removed remotely, but ${branch}'s tip is not a bit ci sync commit — a developer wrote the ` +
              `branch's current bit state, so it is not safe to assume the branch is only our mirror; keeping it`
          )
        );
        return `${laneName} -> close-pr (${prClause}, branch ${branch} kept: its tip was not written by bit ci sync)`;
      }
      if (keep === 'tip-advanced-during-run') {
        return `${laneName} -> close-pr (${prClause}, branch ${branch} kept: ${keptBecause})`;
      }
      logger.console(
        formatWarningSummary(`lane removed remotely but branch carries unmerged commits; keeping branch ${branch}`)
      );
      return (
        `${laneName} -> close-pr (${prClause}, branch ${branch} kept: ` +
        `it carries commits missing from the default branch)`
      );
    }

    // Reaching this guard means something upstream is wrong; log it and keep the branch.
    if (isProtectedBranch(branch, defaultBranch, this.deps.cfg.mainSyncBranch)) {
      logger.consoleWarning(
        `Refusing to delete branch ${branch}: it is ${
          branch === defaultBranch ? 'the default branch' : 'the main sync branch'
        }, whatever the ownership evidence concluded`
      );
      return `${laneName} -> close-pr (${prClause}, branch ${branch} kept: deleting it is never allowed)`;
    }

    // Best-effort: the branch may be protected, or already removed by hand.
    let branchDeleted = true;
    let leaseRefused = false;
    try {
      await this.pushBranchDeletion(branch, deleteAt);
    } catch (e: any) {
      const message = String(e?.message || e);
      branchDeleted = false;
      // The second belt: the re-read above and this push are not atomic, so the server gets the last word.
      leaseRefused = isStaleLeaseRejection(message);
      logger.consoleWarning(
        leaseRefused
          ? `Not retiring branch ${branch}: the remote refused the lease on ${deleteAt} — it advanced ` +
              `between the re-read and the delete`
          : `Could not delete remote branch ${branch}: ${message}`
      );
    }
    if (leaseRefused) {
      return `${laneName} -> close-pr (${prClause}, branch ${branch} kept: ${KEPT_BECAUSE['tip-advanced-during-run']})`;
    }
    return `${laneName} -> close-pr (${prClause}, branch ${branch} ${branchDeleted ? 'deleted' : 'left in place'})`;
  }

  /** Seams for the retirement path, so the one irreversible outcome is unit-testable without a remote. */
  private currentBranchTip(branch: string): Promise<string | undefined> {
    return refetchBranchTip(branch);
  }

  private async pushBranchDeletion(branch: string, expectedTipSha: string): Promise<void> {
    await git.push(deleteBranchArgs(branch, expectedTipSha));
  }

  /**
   * Record a halt without touching the PR on a dry run — `--dry-run` promises no PR writes, and
   * labelling freezes a lane's syncs. The line stays HALT-prefixed either way. Every pre-planning halt
   * goes through here so the guard cannot be forgotten at one site.
   */
  private async haltOrReport({
    laneName,
    laneIdStr,
    branch,
    reason,
    pr,
    dryRun,
    commentNote,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    reason: string;
    pr?: PrInfo;
    dryRun?: boolean;
    commentNote?: string;
  }): Promise<string> {
    if (dryRun) {
      const { logger } = this.deps;
      logger.console(formatWarningSummary(`Cannot sync lane ${laneIdStr} automatically: ${reason}`));
      logger.console(formatWarningSummary('Dry-run: the PR is not labelled or commented on'));
      return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
    }
    return this.executeHalt({ laneName, laneIdStr, branch, reason, pr, commentNote });
  }

  /**
   * Hand the lane back to a human: label the PR so subsequent runs skip it, and comment the resolution
   * steps. `commentNote` replaces the default steps for halts where they would be wrong.
   */
  private async executeHalt({
    laneName,
    laneIdStr,
    branch,
    reason,
    pr,
    commentNote,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    reason: string;
    pr?: PrInfo;
    commentNote?: string;
  }): Promise<string> {
    const { logger, gitHost } = this.deps;
    logger.console(formatWarningSummary(`Cannot sync lane ${laneIdStr} automatically: ${reason}`));
    if (gitHost && pr) {
      try {
        await gitHost.addLabel(pr.number, CONFLICT_LABEL);
        await gitHost.comment(pr.number, haltCommentBody({ reason, branch, laneId: laneIdStr, note: commentNote }));
      } catch (e: any) {
        // Failing to annotate the PR must not replace the real reason with a git-host API error.
        logger.consoleWarning(`Failed to annotate PR #${pr.number} with the sync conflict: ${e?.message || e}`);
      }
    } else if (gitHost) {
      logger.console(
        formatWarningSummary(`No open PR found for ${branch} — the halt is recorded in this run's summary only`)
      );
    } else {
      logger.console(
        formatWarningSummary(`No configured git host provider — skipping conflict label/comment for ${branch}`)
      );
    }
    return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
  }

  /**
   * Drive the workspace's filesystem to the remote lane's content; returns the error so the caller can
   * halt. Two traps make a plain `switchToLane` insufficient: (1) it defaults to `forceOurs`, which
   * never touches the filesystem — the commit would claim the branch mirrors the lane over the default
   * branch's files — so `forceOurs` is cleared and `forceTheirs` set; (2) switching onto the lane the
   * workspace already sits on throws "already checked out", which `switchToLane` swallows as success
   * and nothing materializes — so step off to main first.
   */
  private async materializeLane(laneIdStr: string): Promise<Error | undefined> {
    const { logger } = this.deps;
    const target = await this.deps.lanes.parseLaneId(laneIdStr);
    // Compares name AND scope, and reads from `.bitmap`, not the scope's lane object — the object read
    // answers "main" on a cold runner and would skip the step-off to main (see `workspace-lane.ts`).
    const isOnTarget = () => currentLaneIdStr(this.deps.lanes) === target.toString();

    if (isOnTarget()) {
      logger.console(
        formatWarningSummary(
          `Workspace is already on ${laneIdStr} — stepping off to main so the re-import actually runs`
        )
      );
      const toMainErr = await this.deps.ci.switchToLaneForSync('main');
      if (toMainErr) return toMainErr;
      if (isOnTarget()) {
        return new Error(`unable to leave lane ${laneIdStr} before re-importing it; the workspace is still on it`);
      }
    }

    const switchErr = await this.deps.ci.switchToLaneForSync(laneIdStr, {
      forceOurs: false,
      forceTheirs: true,
      writeAdoptedFiles: true,
    });
    if (switchErr) return switchErr;

    // Verify before the caller commits a `.bitmap` asserting this lane's content.
    if (!isOnTarget()) {
      return new Error(
        `switching to lane ${laneIdStr} reported success but the workspace is on ` +
          `"${currentLaneIdStr(this.deps.lanes) ?? 'main'}"`
      );
    }
    return undefined;
  }

  private async fetchOnce() {
    if (this.fetched) return;
    await fetchRemoteHeads();
    this.fetched = true;
  }

  /**
   * The remote lane's data, or undefined when the lane no longer exists. The remote queried must be
   * the lane's HOSTING scope: asking `defaultScope` for a lane it does not host answers "was not
   * found" — the input that drives `close-pr`, which deletes branches.
   */
  private async getRemoteLane(target: LaneTarget): Promise<LaneData | undefined> {
    const { hostScope, name } = target;
    const lanes = await this.deps.lanes.getLanes({ remote: hostScope, name }).catch((e) => {
      // "was not found" = the lane is gone: a legitimate state (drives close-pr), not an error.
      if (e.toString().includes('was not found')) return [];
      throw new Error(`Failed to read lane ${hostScope}/${name} from the remote: ${e.toString()}`);
    });
    return lanes[0];
  }

  /**
   * The open PR for the branch, if any. A git-host API hiccup degrades to "no PR known" rather than
   * failing the lane — the git side of the sync is still correct and the next run re-reads the PR.
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
      return !hasSyncMarker(message);
    });
    return entry?.message || `chore: sync ${branch} into the lane (from ${defaultBranch})`;
  }

  /**
   * Stage everything, commit with the annotated sync message, and push. NEVER force-pushes: a rejected
   * push means someone pushed concurrently and the next run should re-plan rather than clobber.
   * `--allow-empty` is only insurance against `git commit` failing the lane outright.
   */
  private async commitAllAndPush(branch: string, message: string) {
    await addAllExceptScopeAndModules();
    await commitWithIdentity(message, { extraArgs: ['--allow-empty'] });
    // `HEAD:refs/heads/<branch>`: a full-ref destination cannot be resolved as a tag or reinterpreted —
    // the configured branch name is user input (see `sync-config.ts`).
    await git.push(['origin', `HEAD:refs/heads/${branch}`]);
    this.deps.logger.console(chalk.green(`Pushed ${branch}`));
  }

  private async openPrForLane({
    target,
    laneIdStr,
    branch,
    defaultBranch,
    laneHead,
    remoteLane,
  }: {
    target: LaneTarget;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
    laneHead: string;
    remoteLane: LaneData;
  }): Promise<string | undefined> {
    const { gitHost, logger } = this.deps;
    if (!gitHost) {
      logger.console(formatWarningSummary(`No configured git host provider — skipping PR creation for ${branch}`));
      return undefined;
    }
    // The lane page lives under the scope that HOSTS the lane, not necessarily `defaultScope`.
    // `replace('.', '/')` replaces only the first dot, which is correct: a scope id may contain at
    // most one dot (is-valid-scope-name.ts) — the same conversion `ScopeUrl.toPathname` does.
    const laneUrl = `https://${getCloudDomain()}/${target.hostScope.replace('.', '/')}/~lane/${target.name}`;
    const body = laneSyncPrBody({ laneIdStr, laneUrl, branch, laneHead, components: remoteLane.components });
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
      // The branch is already pushed — the load-bearing half. A failed PR creation shouldn't fail the
      // lane; the next run retries.
      logger.consoleWarning(`Could not open a PR for ${branch}: ${e?.message || e}`);
      return undefined;
    }
  }

  /**
   * Put the workspace back on main with the default branch checked out. Best-effort, warn-only, so a
   * restore hiccup can't throw out of a `finally` and mask the real error. The checkout is forced
   * (switching back to main rewrites `.bitmap`); the scoped clean discards files a halted lane
   * materialized but never committed, which would otherwise be staged onto the NEXT lane's branch;
   * the reload makes the next lane resolve against the right checkout. This is a checkout, never a
   * push — and `MainSyncExecutor.restoreWorkspace` must not diverge from it.
   */
  private async restoreWorkspace(defaultBranch: string) {
    const { logger } = this.deps;
    try {
      if (currentLaneIdStr(this.deps.lanes)) {
        const switchErr = await this.deps.ci.switchToLaneForSync('main');
        if (switchErr) logger.consoleWarning(`Could not switch the workspace back to main: ${switchErr.message}`);
      }
      await checkoutPristineRestore(defaultBranch, () => this.deps.ci.reloadWorkspaceFromDisk());
    } catch (e: any) {
      logger.consoleWarning(`Could not restore the workspace after sync: ${e?.message || e}`);
    }
  }
}

/**
 * Whether a `filesStatus` entry represents a conflict. Compared against `FileStatus` rather than
 * string literals — its values are chalk-colored labels. `deletedConflict` counts too.
 */
function isConflictFileStatus(status: string): boolean {
  return status === FileStatus.manual || status === FileStatus.binaryConflict || status === FileStatus.deletedConflict;
}

/**
 * The body of the pull request that mirrors a lane onto a branch. The component list is capped so the
 * body stays inside the git host's size limit however large the lane is; the total is not.
 */
export function laneSyncPrBody({
  laneIdStr,
  laneUrl,
  branch,
  laneHead,
  components,
}: {
  laneIdStr: string;
  laneUrl: string;
  branch: string;
  laneHead: string;
  components: LaneData['components'];
}): string {
  const listed = capEntries(
    components.map((comp) => `- \`${comp.id.toStringWithoutVersion()}\` @ \`${comp.head.slice(0, 9)}\``),
    '- '
  ).join('\n');
  return [
    `Mirrors the Bit lane [\`${laneIdStr}\`](${laneUrl}) onto \`${branch}\`.`,
    '',
    `- lane: ${laneUrl}`,
    `- lane head: \`${laneHead}\``,
    '',
    `Components on the lane (${components.length}):`,
    listed || '_none_',
    '',
    'This PR is maintained by `bit ci sync` — push to the branch to send changes back to the lane.',
  ].join('\n');
}

/**
 * Single-quote a value interpolated into a copy-pasteable shell command. Lane names may contain `$` and
 * `!`, and a configured branch name may contain anything git accepts as a ref — including a quote.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Resolution instructions posted on a halted PR. `note` replaces the default steps for halts where
 * they do not apply (the branch-aliasing halt, whose PR belongs to a different lane).
 */
export function haltCommentBody({
  reason,
  branch,
  laneId,
  note,
}: {
  reason: string;
  branch: string;
  laneId: string;
  note?: string;
}): string {
  const resolution =
    note ??
    `To resolve locally:
  git fetch origin && git checkout ${shellQuote(branch)}
  bit lane import ${shellQuote(laneId)}
  # resolve conflicts, commit the result, then:
  git push origin ${shellQuote(branch)}`;
  return `bit-git-sync could not reconcile this branch automatically: ${reason}

${resolution}

Remove the \`bit-sync-conflict\` label to resume syncing.
`;
}
