import chalk from 'chalk';
import type { Logger } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import type { LaneData } from '@teambit/legacy.scope';
import { getCloudDomain } from '@teambit/legacy.constants';
import { FileStatus } from '@teambit/component.modules.merge-helper';
import { git } from '../git';
import type { CiMain } from '../ci.main.runtime';
import type { CiSyncConfig, LaneTarget } from './sync-config';
import { laneNameToBranch } from './sync-config';
import type { BranchSyncState } from './sync-state';
import {
  CONFLICT_LABEL,
  SYNC_COMMIT_MARKER,
  buildSyncCommitMessage,
  readBranchSyncState,
  hasSyncMarker,
  isSyncAuthoredMessage,
} from './sync-state';
import { branchStateFingerprint, fingerprintIdVersions } from './bitmap-state';
import { currentLaneIdStr, ensureCurrentLaneObject } from './workspace-lane';
import type { GitHostProvider, PrInfo } from './git-host-provider';
import type { BranchKeepReason, LaneOwnershipEvidence } from './sync-planner';
import { planLaneSync } from './sync-planner';
import {
  addAllExceptScopeAndModules,
  branchExistsOnRemote,
  checkoutPristine,
  checkoutPristineRestore,
  ensureGitIdentity,
  fetchRemoteHeads,
  isAncestor,
} from './git-ops';

/**
 * Prefix of the summary line returned by `syncLane` when a lane could not be reconciled. The
 * command layer scans the collected summaries for this prefix to decide the process exit code —
 * `syncLane` deliberately does NOT throw on halt, because one unreconcilable lane must not abort
 * the sync of every other lane in the run.
 */
export const HALT_SUMMARY_PREFIX = 'HALTED';

/**
 * Prefix of the summary line returned when the reconciler **refuses** a target the user asked for by name.
 *
 * A refusal is not a halt. A halt means "this lane/branch pair is mid-flight and now needs a human", and it
 * annotates the PR so the next run skips it. A refusal means "there is nothing here to reconcile, and you
 * asked for it specifically, so here is why" — there is no branch and no PR to annotate, nothing is
 * mid-flight, and no future run is affected. The two are separated because only one of them describes a
 * repository that needs attention; conflating them would make a perfectly healthy repository report a
 * conflict. Like `HALT_SUMMARY_PREFIX`, this makes the run exit non-zero (the user's explicit request was
 * not carried out), but the command layer reports it as a plain refusal rather than as a sync conflict.
 */
export const REFUSED_SUMMARY_PREFIX = 'REFUSED';

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
 * Fingerprint of a lane's content — one half of the comparison the planner makes; the other half is
 * `branchStateFingerprint` over the branch's committed `.bitmap`, and the two are deliberately produced by
 * the same primitive so that "equal" means exactly "the branch records every lane component at the lane's
 * head".
 *
 * We deliberately do NOT use `LaneData.hash`: that hash is minted randomly at lane-creation time
 * (`sha1(v4())`) and does not change when the lane's components advance, so it can't answer "did
 * the lane move since we last synced it?". This is derived from content instead.
 */
export function laneHeadFingerprint(components: LaneData['components']): string {
  return fingerprintIdVersions(components.map((comp) => `${comp.id.toStringWithoutVersion()}@${comp.head}`));
}

/** The lane's component ids, without versions — the id set `branchStateFingerprint` reads off the branch. */
function laneComponentIds(components: LaneData['components']): string[] {
  return components.map((comp) => comp.id.toStringWithoutVersion());
}

/**
 * The lane's components that do **not** belong to `defaultScope`, i.e. the ones this repository does not
 * map. An empty result means the lane's content is entirely this repository's business.
 *
 * A lane is an org-global change set: it is *hosted* on one scope but may *contain* components from many,
 * so one lane can span several repositories. `bit ci sync` reconciles a lane as a whole — it fingerprints
 * every component, materializes every component onto the branch, and snaps/exports every component back —
 * so a lane with foreign content cannot be reconciled here without writing another repository's components
 * into this one and releasing them without that repository's review. Until slicing exists (Stage 1 of the
 * design), such a lane is refused; this is the predicate behind that refusal.
 *
 * **What it does not see.** `LaneData.components` is the lane's visible component list: soft-deleted
 * components are filtered out by the remote, and `updateDependents` — the hidden cascade entries — is a
 * separate field this deliberately does not read. Either can carry a foreign scope. Neither is ever
 * materialized onto a branch, snapped, or exported by the reconciler, so neither can leak through the paths
 * this predicate guards; the boundary is stated here so a future reader knows it was considered rather than
 * missed. If a later stage starts acting on those entries, this predicate has to grow with it.
 */
export function foreignLaneComponents(components: LaneData['components'], defaultScope: string): string[] {
  return components.filter((comp) => comp.id.scope !== defaultScope).map((comp) => comp.id.toStringWithoutVersion());
}

/** How many foreign component ids a cross-scope message names before it summarizes the rest. */
const MAX_LISTED_FOREIGN_COMPONENTS = 5;

/**
 * How many component ids a pull-request body or comment enumerates before it summarizes the rest.
 *
 * A lane is not bounded in size, and neither was any of these enumerations: a 2,000-component lane
 * produced a PR body of a couple of hundred kilobytes. GitHub caps a pull request body (and an issue
 * comment) at 65,536 characters and rejects the *whole* request over it, so the PR simply failed to open
 * — for the largest lanes, which are exactly the ones a reviewer most needs a PR for. Twenty is roughly
 * where a list stops being read item by item and the count starts doing the work instead.
 */
const MAX_LISTED_COMPONENTS = 20;

/**
 * `entries`, capped at `max`, with a final "…and K more" entry standing in for the remainder.
 *
 * The bound is on the *entries*, not on the rendered length, deliberately: a body truncated to a
 * character budget can cut a markdown list mid-line, and the reader cannot tell a truncated document from
 * a complete one. Dropping whole entries and stating how many were dropped is always readable, and it
 * keeps the number the reader needs — how much they are not seeing — in the text itself.
 *
 * `overflowPrefix` carries the caller's list marker ('- ', '  - ') onto the summary line so it renders as
 * part of the same list rather than as a stray paragraph; inline callers pass nothing.
 */
export function capEntries(entries: string[], overflowPrefix = '', max: number = MAX_LISTED_COMPONENTS): string[] {
  if (entries.length <= max) return entries;
  return [...entries.slice(0, max), `${overflowPrefix}…and ${entries.length - max} more`];
}

/**
 * The shared clause describing *why* a lane is cross-scope: the foreign **scopes** (which other
 * repositories the change touches) and a bounded sample of the foreign **components** — enough for a human
 * to see what the lane spans without pasting a hundred ids into a summary or a PR comment.
 *
 * The three outcomes below (skip, refusal, halt) each frame this clause differently, because they mean
 * different things; the facts they report are the same.
 */
export function crossScopeDescription(foreignIds: string[], defaultScope: string): string {
  // The scope is everything before the FIRST '/': a component id is `<scope>/<namespace…>/<name>`, so
  // splitting at the last one would report `acme.shop/ui` as the scope of `acme.shop/ui/button`.
  const scopes = [...new Set(foreignIds.map((id) => id.split('/', 1)[0]))].sort();
  const sample = capEntries(foreignIds, '', MAX_LISTED_FOREIGN_COMPONENTS).join(', ');
  return (
    `components from scope(s) ${scopes.join(', ')} (this repo maps scope ${defaultScope}); ` +
    `foreign components: ${sample}`
  );
}

/**
 * A cross-scope lane that was merely **enumerated** (an `--all` run, a push/webhook-triggered reconcile).
 *
 * This is a *skip*, not a failure, and the run stays green. A cross-scope lane is a legitimate thing to
 * create on bit.cloud — it is simply not something this repository can mirror yet, so no branch is created
 * for it. A cron or webhook run that keeps finding one must keep reporting success, otherwise a standing,
 * perfectly valid lane turns the pipeline permanently red and the repository learns to ignore its own CI.
 */
export function crossScopeSkipSummary(laneName: string, foreignIds: string[], defaultScope: string): string {
  return (
    `${laneName} -> skipped (cross-scope lane: ${crossScopeDescription(foreignIds, defaultScope)} — ` +
    `no branch created; see the docs' Cross-scope lanes section)`
  );
}

/**
 * A cross-scope lane the user named **explicitly** (`bit ci sync <lane>`).
 *
 * The lane is legitimate and this repository is not going to mirror it — but a request for one specific
 * lane that quietly does nothing is a worse answer than an error, so this exits non-zero and explains
 * itself. It is a refusal, not a halt: no PR is labelled and no branch is written, so nothing about a
 * *future* run changes either.
 *
 * A branch may nevertheless already exist under this lane's name — someone else's, or one this repository
 * mirrored before the lane grew a foreign component and whose claim has since lapsed. `existingBranch`
 * exists so the closing sentence describes that truthfully instead of promising a branch was never made.
 */
export function crossScopeRefusal(foreignIds: string[], defaultScope: string, existingBranch?: string): string {
  // The promise at the end has to be true of what actually happened. A branch may already exist here —
  // someone else's, or one this repository made before the lane grew a foreign component and whose claim
  // has since lapsed — and claiming "no branch was created" would be a different (false) statement from
  // "nothing was written".
  const outcome = existingBranch
    ? `Nothing was written; the existing branch ${existingBranch} was left untouched`
    : 'No branch was created and nothing was written';
  return (
    `cross-scope lane: ${crossScopeDescription(foreignIds, defaultScope)}; syncing cross-scope lanes is ` +
    `not supported yet — see the docs' Cross-scope lanes section. ${outcome}`
  );
}

/**
 * The halt reason for a branch that is the **live mirror of a different lane** than the one being
 * reconciled — two lanes with the same name in different scopes map to the same branch, because the branch
 * mapping is keyed on the name. Naming both ids is the whole point: it tells the human which of the two
 * lanes owns the branch and which one was refused.
 */
export function branchMirrorsOtherLaneReason(branch: string, mirroredLaneIdStr: string, laneIdStr: string): string {
  return (
    `branch ${branch} mirrors lane ${mirroredLaneIdStr}; refusing to plan for ${laneIdStr} — two lanes ` +
    `with the same name in different scopes map to the same branch, and reconciling this one would ` +
    `overwrite the other lane's mirror`
  );
}

/**
 * The PR comment for the branch-aliasing halt, which is the one halt whose PR belongs to a **different**
 * lane than the one that failed. Its reviewers see a `bit-sync-conflict` label appear on a pull request
 * whose own lane is perfectly healthy, so the comment has to say whose fault it is and what to do — and it
 * must NOT carry the default "import the lane onto this branch" steps, which name the *refused* lane and
 * would perform exactly the overwrite the halt just prevented.
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
 * A lane that **became** cross-scope after this repository had already mirrored it onto a branch.
 *
 * This is the one cross-scope shape that is a genuine halt: the pair is mid-flight. The branch is the
 * lane's *live* mirror — its committed `.bitmap` points at this lane, and the commit that put it there is
 * not yet in the default branch — so there may be an open PR and dev commits on it that can no longer
 * converge with the lane. That needs a human, and the PR is exactly where to say so. Liveness is not a
 * detail: a merged sync PR's state commit lands on the default branch's first-parent line, so every branch
 * cut from it afterwards inherits that `.bitmap`, and attribution alone would label ordinary developer
 * branches.
 */
export function crossScopeMidFlightHaltReason(branch: string, foreignIds: string[], defaultScope: string): string {
  return (
    `lane became cross-scope after it was mirrored onto ${branch}: ${crossScopeDescription(foreignIds, defaultScope)}; ` +
    `the branch and the lane can no longer be reconciled automatically — see the docs' Cross-scope lanes section`
  );
}

/**
 * Branches `executeClosePr` refuses to delete no matter what the ownership evidence concluded: the
 * repository's default branch and the main-scope sync branch. The planner should never route either here
 * (neither is treated as lane-mapped), so this is belt-and-braces against a wrong enumeration or evidence
 * chain upstream — the two branches whose deletion is most catastrophic get an unconditional guard at the
 * one site that runs `git push origin --delete`.
 */
export function isProtectedBranch(branch: string, defaultBranch: string, mainSyncBranch: string): boolean {
  return branch === defaultBranch || branch === mainSyncBranch;
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
   * `HALT_SUMMARY_PREFIX`, and on a refusal with `REFUSED_SUMMARY_PREFIX`, so the caller can aggregate
   * them and exit non-zero; **it does not
   * throw** — that is the contract the `--all` loop is written against, and it has to hold for every
   * failure mode, not only the ones each step anticipates. The steps below route their own expected
   * failures to `executeHalt`; this wrapper is what covers the unexpected ones (a git command that
   * fails, a `checkout -B` that collides, a push the remote rejects, a git-host API that throws where
   * nobody expected it), any of which would otherwise abort the sync of every lane after this one.
   */
  async syncLane(
    target: LaneTarget,
    opts: {
      dryRun?: boolean;
      /**
       * The user named this lane on the command line, as opposed to it being enumerated by `--all` or
       * resolved from a pushed branch. It changes nothing about what is written; it decides how a
       * cross-scope lane is *reported* — see `crossScopeOutcome`.
       */
      explicitTarget?: boolean;
    } = {}
  ): Promise<string> {
    const { cfg, logger } = this.deps;
    const laneName = target.name;
    // The BRANCH mapping is by lane NAME only — a lane hosted elsewhere still mirrors onto the branch its
    // name maps to. Everything addressed to bit, by contrast, uses the lane's REAL id: reading it from the
    // remote, snapping/exporting onto it, and the id bit writes into the branch's `.bitmap` lane pointer
    // (which is what later attributes the branch to this lane). Deriving that id from `defaultScope`
    // instead would make the reconciler read, write and claim a lane that does not exist.
    const branch = laneNameToBranch(laneName, cfg);
    const laneIdStr = `${target.hostScope}/${laneName}`;
    try {
      return await this.reconcileLane({
        target,
        laneIdStr,
        branch,
        dryRun: opts.dryRun,
        explicitTarget: opts.explicitTarget,
      });
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

    // RESERVED BRANCHES. The default branch and the main sync branch belong to the main-scope path, which
    // proposes its changes as a PR and never writes to the default branch directly. A `branches` override
    // (or a lane literally named after the default branch) can map a lane onto one of them, and the lane
    // path would then force-checkout it, commit and push — the one thing the whole design refuses to do.
    // The guard lives here, not only in the command layer, for the same reason the purity check does: this
    // is the single funnel every trigger passes through, and `--all` reaches it without passing the
    // command layer's name checks at all.
    if (isProtectedBranch(branch, defaultBranch, cfg.mainSyncBranch)) {
      const reason =
        `lane ${laneIdStr} maps to ${branch}, which is ` +
        `${branch === defaultBranch ? "the repository's default branch" : 'the main sync branch maintained by this command'}; ` +
        `the main scope is reconciled by "bit ci sync --main", never as a lane. Nothing was written`;
      if (explicitTarget) {
        logger.console(chalk.red(`Cannot sync lane ${laneIdStr}: ${reason}`));
        return `${REFUSED_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
      }
      const summary = `${laneName} -> skipped (${reason})`;
      logger.console(chalk.yellow(summary));
      return summary;
    }

    const remoteLane = await this.getRemoteLane(target);

    const laneHead = remoteLane ? laneHeadFingerprint(remoteLane.components) : undefined;
    const branchExists = await branchExistsOnRemote(branch);
    // No branch => no history to read (and `git log origin/<branch>` would throw). The planner
    // short-circuits on `!branchExists` before it looks at any of these fields.
    const branchState: BranchSyncState = branchExists
      ? await readBranchSyncState(branch, defaultBranch, defaultScope)
      : { stateCommit: undefined, bitmap: undefined, hasDevCommits: false, tipMessage: '' };
    if (hasSyncMarker(branchState.tipMessage)) {
      logger.console('branch tip is a bit-sync commit; reconciler will no-op unless the lane moved');
    }

    // The PR is read *before* any refusal below, because `bit-sync-conflict` is how a human silences a
    // halt: every halt the reconciler reports must be suppressible by that label, or a standing problem
    // re-comments on the same PR on every scheduled run and the label becomes a lie.
    const pr = await this.findPr(branch);
    const conflictLabelPresent = pr?.labels.includes(CONFLICT_LABEL) ?? false;
    const suppressedByLabel = `${laneName} -> noop (PR is labeled ${CONFLICT_LABEL}; resolve and remove the label to resume)`;

    // Which lane, if any, this branch is the *live* mirror of.
    //
    // ATTRIBUTION is the lane pointer in the branch's committed `.bitmap` — bit's own record of which lane
    // this checkout is on. It is structural: it survives a git host rewriting commit messages on squash-,
    // rebase- or ff-merge, and nobody can produce it by writing text into a commit message.
    //
    // "Live" is then doing the load-bearing work: a branch pointing at lane X proves nothing on its own,
    // because once X's sync PR is merged that `.bitmap` state sits on the default branch's own first-parent
    // line. Only a state commit the default branch does NOT contain (`own-live`) says "this branch is X's
    // mirror, right now". The evidence is computed once here and reused for the lane-gone path below, so a
    // branch with a lane pointer costs one or two extra `merge-base` calls **per lane per run** (up to 2N on
    // an `--all` run of N lanes) — the price of not confusing an inherited state for a claim.
    const mirroredLane = branchState.bitmap?.laneIdStr;
    const claim: LaneOwnershipEvidence =
      mirroredLane && branchState.stateCommit
        ? await this.assessBranchOwnership({ branch, defaultBranch, stateCommit: branchState.stateCommit })
        : 'inherited-or-none';
    const mirroredLaneIdStr = claim === 'own-live' ? mirroredLane : undefined;

    // TWO LANES, ONE BRANCH. The branch mapping is keyed on the lane NAME, so `other.scope/release` and
    // `<defaultScope>/release` map to the same branch. If this branch is the live mirror of a *different*
    // lane, planning against it would hijack it: `import-lane` would materialize this lane over the other
    // lane's content and repoint its `.bitmap`, and `merge-diverged` would snap one lane's work
    // onto the other. Halt instead — the pair really is mid-flight, and its PR is where to say so.
    //
    // Only when this lane actually exists: with no lane there is nothing to write onto the branch, and the
    // one destructive action left (`close-pr`, which deletes it) already refuses without attribution to
    // *this* lane. Halting there instead would turn a branch this repository simply cannot resolve — a
    // foreign-hosted lane's branch met by name, which the docs describe as a no-op — into a permanently red
    // scheduled run with no PR to label.
    if (laneHead && mirroredLaneIdStr && mirroredLaneIdStr !== laneIdStr) {
      if (conflictLabelPresent) return suppressedByLabel;
      // NOTE: the PR annotated here belongs to `mirroredLaneIdStr` — the lane that *owns* this branch —
      // not to the lane being reconciled, which has no PR of its own. Labelling it stops the owner's
      // syncs until a human intervenes, which is the correct trade (two lanes fighting over one branch
      // needs a human either way) but makes it doubly important that this goes through `haltOrReport`:
      // under `--dry-run` it must not touch that PR at all. `commentNote` is what tells the owner's
      // reviewers why a label appeared on a PR whose own lane is perfectly healthy.
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

    // RELEVANCE / PURITY. Everything above is a read; this is the last point before anything is planned or
    // written. A lane whose content is not confined to this repository's scope cannot be reconciled here:
    // `bit ci sync` has no notion of a partial lane yet — it fingerprints, materializes, snaps and exports
    // the lane *whole* — so mirroring one would write another repository's components into this one, put
    // them in a PR nobody in their scope reviews, and, in the release direction, export them from here.
    //
    // A cross-scope lane is nonetheless a perfectly legitimate thing for someone to create on bit.cloud, so
    // the outcome depends on how this repository arrived at it — see `crossScopeOutcome`. The check lives
    // in the executor because EVERY trigger (a bare lane argument, `--branch`, `--all`) funnels through
    // here, and it needs the lane's content, which is only known once the lane has been read.
    const foreign = remoteLane ? foreignLaneComponents(remoteLane.components, defaultScope) : [];
    if (foreign.length) {
      return this.crossScopeOutcome({
        laneName,
        laneIdStr,
        branch,
        branchExists,
        foreign,
        // Mid-flight: this branch is the LIVE mirror of THIS lane — this repository reconciled the pair
        // back when the lane's content was single-scope, so an open PR and any dev commits on the branch
        // are now stranded. `mirroredLaneIdStr` has already excluded the two impostors: a branch that
        // merely shares the lane's name, and one whose `.bitmap` state was inherited from the default branch.
        midFlight: mirroredLaneIdStr === laneIdStr,
        explicit: Boolean(explicitTarget),
        conflictLabelPresent,
        suppressedByLabel,
        pr,
        dryRun,
      });
    }
    // "The lane is gone but the branch is still here" is the only situation whose outcome depends on the
    // claim, and the only one that can delete a branch — so the answer is reported only where it meant
    // something. Attribution to *this* lane is still required: the claim above was computed for whichever
    // lane the branch's `.bitmap` names, and a claim on someone else's behalf licenses nothing here.
    const laneIsGone = branchExists && !laneHead;
    const ownership: LaneOwnershipEvidence = laneIsGone && mirroredLane === laneIdStr ? claim : 'inherited-or-none';

    // S — WHAT THE BRANCH REFLECTS, read off the branch's own `.bitmap` rather than off a commit message.
    //
    // Only when the branch's `.bitmap` names *this* lane: a branch on main, or one mirroring a different
    // lane, has no state for this pair, and the planner's `!lastSyncedHead` rows are exactly the ones that
    // handle "this branch has no state of ours" (adopt it when it is otherwise untouched, halt when it
    // carries commits nobody can order against the lane).
    //
    // The comparison against `laneHead` is between two fingerprints of the same shape, so equality means
    // "the branch records every lane component at the lane's head" — i.e. converged at the bit level. Note
    // what that buys over the trailer: a developer who snaps and exports from the branch and commits the
    // resulting `.bitmap` has genuinely advanced *the branch's* state to the lane's, and this reads it as
    // converged. The trailer, which only ever recorded what the *reconciler* last wrote, read the same
    // branch as "lane moved + dev commits" and manufactured a `merge-diverged` round of churn.
    const lastSyncedHead =
      remoteLane && branchState.bitmap && mirroredLane === laneIdStr
        ? branchStateFingerprint(branchState.bitmap, laneComponentIds(remoteLane.components))
        : undefined;

    // The one message-derived input, and it can only ever WITHHOLD a branch deletion — see
    // `LaneSyncInput.tipIsSyncCommit` and the `own-live` case in the planner.
    //
    // `isSyncAuthoredMessage`, NOT `hasSyncMarker`: this feeds a branch deletion, and the loop guard's bare
    // substring match is satisfied by a message that merely quotes the marker. "revert the [bit-sync] bitmap
    // churn" is a natural thing to write on a commit that also touches `.bitmap` — which is precisely the
    // laundering shape the conjunction exists to stop, so quoting must not amount to claiming authorship.
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
      const line = `${laneName} -> ${action.type}`;
      logger.console(chalk.yellow(`🏃 Dry-run: ${line}`));
      return line;
    }

    // A pair can be converged *at the bit level* while the branch tip still holds source edits nobody has
    // snapped: a single commit that both rewrites `.bitmap` and carries an unsnapped edit is its own state
    // commit, so `hasDevCommits` is false and the edit is invisible to this run. It is not lost and it is not
    // permanent — the next commit on the branch makes `hasDevCommits` true and the export picks it up — but a
    // bare "converged" would be a more confident sentence than the evidence supports, so say so out loud.
    // See the docs' "known Stage-1 delta"; the real fix is snap-graph reachability, not a planner change.
    //
    // `laneHead` must be checked explicitly: with no lane AND no attribution both fingerprints are undefined,
    // and `undefined === undefined` would fire this on every ordinary developer branch of every `--all` run —
    // branches that are being ignored precisely because they are nothing to do with us.
    if (
      action.type === 'noop' &&
      action.reason === 'converged' &&
      !tipIsSyncCommit &&
      laneHead &&
      lastSyncedHead === laneHead
    ) {
      logger.console(
        chalk.yellow(
          `converged on bit state, but ${branch}'s tip is not a bit ci sync commit — any source edits it ` +
            `carries that were never snapped stay invisible until the next commit on the branch`
        )
      );
    }

    switch (action.type) {
      case 'noop':
        return `${laneName} -> noop (${action.reason})`;
      case 'import-lane':
        // `laneHead` is always defined on this path — the planner only emits import-lane when the
        // lane exists on the remote. `remoteLane` is its LaneData (needed for the PR body).
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
          // `keepReason` exists only on the keep variant of the action — the union is what guarantees a keep
          // can never reach `executeClosePr` without a reason to print.
          keepReason: action.deleteBranch ? undefined : action.keepReason,
        });
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
   * What a cross-scope lane means *for this repository*, which is not one thing:
   *
   * 1. **Mid-flight halt.** The branch is this lane's *live* mirror — its `.bitmap` names this lane and the
   *    commit that wrote it is not yet in the default branch (see `mirroredLaneIdStr` in `reconcileLane`; a
   *    merged sync PR's `.bitmap` is inherited by every branch cut from the default branch afterwards, and
   *    must not count).
   *    The pair was reconcilable until the lane grew a foreign component, and an open PR and any dev
   *    commits on that branch can now never converge. That is a genuine conflict — label the PR, comment
   *    the reason, exit non-zero — and it self-suppresses once labelled. Checked first: it outranks how the
   *    lane was targeted, because the problem is the state of the pair, not the phrasing of the request.
   * 2. **Explicit refusal.** This branch is not our live mirror, and the user asked for this lane by name.
   *    There is nothing to label, but silently doing nothing would be a worse answer than an error — so the
   *    run exits non-zero with the explanation. It is reported as a refusal, not a sync conflict. (A branch
   *    of that name may still exist; the message says so rather than claiming none was created.)
   * 3. **Enumerated skip.** Not our live mirror, and the lane was merely enumerated (`--all`, or a
   *    push/webhook-triggered reconcile). A cross-scope lane is a legitimate thing to have on bit.cloud;
   *    this repository just cannot mirror it yet. The run says so and **stays green** — otherwise one
   *    standing cross-scope lane would make every scheduled run fail forever, and a permanently red
   *    pipeline is one nobody reads.
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
      // Self-suppression, exactly as the planner does for every other halt: once a human has acknowledged
      // the conflict by labelling the PR, the reconciler goes quiet. Without this a lane that became
      // cross-scope would post a fresh comment on the same PR on every scheduled run, forever, and the
      // label — the documented way to silence it — would do nothing.
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
      logger.console(chalk.red(`Cannot sync lane ${laneIdStr}: ${reason}`));
      return `${REFUSED_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
    }

    const summary = crossScopeSkipSummary(laneName, foreign, defaultScope);
    logger.console(chalk.yellow(summary));
    return summary;
  }

  /**
   * Mirror the remote lane onto the branch: check the branch out, materialize the lane into the
   * workspace, and commit the result. The committed `.bitmap` — the lane pointer plus every component's
   * version — IS the record of which lane state the branch now holds; the message's trailer and marker
   * ride along as annotations.
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
      // Write the lane's files and `.bitmap` into the workspace. This is the load-bearing step: the
      // commit below records the resulting `.bitmap` as the branch's state, so a switch that moved the
      // pointer without materializing the files would make every later run read the pair as converged
      // over content the branch never received. See `materializeLane` for why a plain
      // `switchToLaneForSync` is not enough.
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
   * Push the branch's dev commits back onto the lane: snap+export the branch's working tree onto
   * the lane, then commit the `.bitmap` the snap produced back onto the branch, so the branch's state and
   * the lane's head are once again the same and the next run sees the two sides as converged.
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
   * Both sides moved since the last sync: the lane has snaps the branch has never seen, and the
   * branch has dev commits the lane has never seen. Converging that requires a real content merge
   * *before* anything is written to either side, in this order:
   *
   * 1. **Merge the lane into the branch's working tree** (`mergeLaneIntoBranchWorkingTree`, i.e.
   *    `bit checkout head --manual`). Conflicts → discard the marker writes and halt for a human.
   * 2. **Snap + export the merged tree** onto the lane. Only now does the lane advance, and it
   *    advances to a snap that contains *both* sides — the snap *is* the merge.
   * 3. **Record the resulting state on the branch** — commit the `.bitmap` the snap produced, and push,
   *    so the next run sees the pair as converged.
   *
   * Why the merge cannot be skipped in favour of "just export and let the export recover": the export
   * path snaps through `snapPrCommit` → `switchToLane`, which defaults to `forceOurs: true`.
   * `getComponentStatusBeforeMergeAttempt` returns without `propsForMerge` under `forceOurs`
   * (`checkout.main.runtime.ts:580`), so `applyVersion` marks every file `unchanged`, leaves the
   * filesystem alone and only moves `.bitmap` onto the lane heads. The snap that follows therefore
   * records *the branch's* tree against the new lane head: every lane-side file edit is silently
   * reverted on the lane tip, the branch never receives the lane's content, and the state this
   * method pushes would then assert convergence over that loss. `exportWithAdoptOnConflict` cannot
   * save it either — it rebases parent pointers, it does not merge files.
   *
   * Anything unexpected halts. This method never throws: one unreconcilable lane must not abort the
   * lanes after it in the run.
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
      await this.checkoutFromRemote(branch, `origin/${branch}`);

      // ---- step 1: merge the lane's snaps into the branch's working tree -----------------------
      const merge = await this.mergeLaneIntoBranchWorkingTree(laneIdStr);
      if (merge.error) {
        return await halt(`failed to merge lane ${laneIdStr} into branch ${branch}: ${merge.error.message}`);
      }
      if (merge.conflicts.length) {
        // The merge left conflict markers in the working tree. Discard them before halting so the
        // workspace (and any later push from this run) can never carry a half-merged tree.
        await this.checkoutFromRemote(branch, `origin/${branch}`);
        // Bounded: this reason is posted as the halt PR comment, and a lane-wide conflict can name every
        // component on the lane.
        return await halt(`merge conflicts in: ${capEntries(merge.conflicts).join(', ')}`);
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
      const laneHead = await this.recordLaneHeadOnBranch(target, laneIdStr, branch);
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
   *
   * **COLD RUNNER.** The lane object has to be in this scope *before* delegating, and the reason is a trap
   * worth stating in full. `snapPrCommit` reuses the existing remote lane by calling `switchToLane`, whose
   * comment promises it "fetches the latest lane head from remote" — and on these paths it never does. The
   * workspace is already on the lane (the branch's `.bitmap` put it there), so `switchLanes` hits
   * `throwForSwitchingToCurrentLane` inside `populatePropsAccordingToLocalLane`, i.e. **before any fetch**,
   * and `switchToLane` swallows that throw as success. Nothing is imported. The `landedOnLane` probe that
   * follows then asks `getCurrentLane()` — a local-scope object read — gets undefined on a cold scope, and
   * `noDestructiveRecovery` turns the resulting "failed to switch" into a halt. The dev commit never
   * reaches the lane.
   *
   * So a switch that no-ops does NOT warm the scope, and "it just switched, therefore the object is there"
   * is only true when the switch actually moved. Importing here fixes the condition rather than the
   * symptom: the probe then passes because the lane really is present, and — the part that matters more —
   * the snap and export that follow operate on the lane's real remote state instead of building a local
   * lane object that never contained the remote's history, which is exactly the stale-lane shape
   * `noDestructiveRecovery` refuses to repair.
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
   * Record on the branch which lane state it now mirrors: re-query the lane (the export just moved
   * it, so any fingerprint taken before is stale), commit everything — crucially the `.bitmap` the snap
   * rewrote, which is the state — and push. Returns the fingerprint for the annotation on the message, or
   * `undefined` when the lane can no longer be read from the remote, in which case the caller halts rather
   * than pushing a commit whose message claims a lane state it cannot name.
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
      // previous sync and `checkoutFromRemote` just loaded that file. If it doesn't (an untracked
      // `.bitmap`, a hand-edited branch, a failed reload), the merge would silently resolve to main's
      // heads and write main's content over the dev work — so refuse and let a human look.
      //
      // `currentLaneIdStr`, NOT `lanes.getCurrentLane()`. That is the difference between reading the
      // branch's pointer and reading the local scope's *cache* of the lane object, and on a cold CI runner
      // (fresh clone, lane never imported) the latter answers "main" for a `.bitmap` that plainly names the
      // lane — so this guard halted every diverged sync on a fresh runner while telling the operator
      // something about their branch that was not true. See `workspace-lane.ts`.
      const target = await lanes.parseLaneId(laneIdStr);
      const current = currentLaneIdStr(lanes);
      if (current !== target.toString()) {
        return {
          conflicts: [],
          error: new Error(
            `the branch's .bitmap points at "${current ?? 'main'}" ` +
              `rather than ${laneIdStr}, so the lane's snaps cannot be merged into the branch's working tree`
          ),
        };
      }

      // Cold runner: the pointer is right, but the lane object and its components may not be in this
      // scope at all. Import them before the merge rather than relying on a fetch three layers down.
      await ensureCurrentLaneObject(lanes);

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
   * Put the working tree on `branch` at a pristine copy of `startPoint` (a remote-tracking ref) and
   * reload the `.bitmap` it brings. See `checkoutPristine` for why each of its three steps is
   * load-bearing; what the three mean *here* is:
   *
   * - a stale local copy of the branch, or a tracked modification an earlier lane left behind, can
   *   never leak into this lane's sync commit;
   * - neither can an untracked leftover: a lane that halted after materializing its components never
   *   committed them, and `commitAllAndPush` stages with `add -A`, so without the clean those files land
   *   on *this* lane's branch as part of a state that does not describe them. This is also the path a
   *   developer's own stray files take in a local run;
   * - and the following bit operation — the `materializeLane` on the import path, the snap on the export
   *   path, or a merge — resolves "current lane" and per-component versions against *this* branch's
   *   `.bitmap` rather than the one the process loaded at startup, which is the default branch's.
   *
   * Nothing is lost: everything worth keeping is on `origin/<branch>` already, and this is a checkout —
   * the executor never force-pushes.
   *
   * This is also the recovery used after a merge (or a failed attempt) has rewritten component files
   * and `.bitmap`: resetting to `origin/<branch>` puts both sides back exactly on the fetched tip. That
   * used to be a separate `resetToRemoteBranch`, identical but for the clean this one was missing.
   */
  private async checkoutFromRemote(branch: string, startPoint: string) {
    await checkoutPristine(branch, startPoint, () => this.deps.ci.reloadWorkspaceFromDisk());
  }

  /**
   * The **reachability** half of `LaneOwnershipEvidence` — how live the branch's bit state is, which is what
   * decides whether the branch may be deleted. See `LaneOwnershipEvidence` for what each answer means.
   *
   * The *attribution* half lives at the call site and is structural: the branch's committed `.bitmap` has a
   * lane pointer, and (for the retirement decision) that pointer names the lane being reconciled. This
   * method deliberately does not repeat that comparison — it is asked only about commits.
   *
   * An unanswerable question resolves to `inherited-or-none`. That is not a fallback chosen for
   * convenience: every other answer permits deleting a branch, and a `merge-base` that failed (unrelated
   * histories, an unresolvable ref, a git hiccup) is not evidence of anything.
   *
   * **Foreign-hosted lanes (Stage 0).** Attribution compares the `.bitmap` pointer against `laneIdStr`, and
   * both sides are scope-qualified — the pointer is the lane's *real* id (`hostScope/name`), so a branch
   * mirroring `other.scope/my-lane` is correctly attributed whenever that same target is passed again. What
   * it deliberately does NOT do is attribute such a branch when it is reached *by branch name* (`--branch`,
   * or the branch half of `--all`), because those paths derive the lane id from `defaultScope`: the
   * expectation becomes `defaultScope/my-lane`, the pointer says `other.scope/my-lane`, they differ, and the
   * evidence is `inherited-or-none` — which the planner turns into a **no-op**. That asymmetry is the safe
   * direction and is why it is acceptable for Stage 0: an unattributed branch is left alone, never retired,
   * and `--all` does not enumerate foreign-hosted lanes anyway (they are explicit-target only). Stage 1's
   * `laneSources` config is what will let branch-derived targeting know which scope hosts a lane.
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
      // A state commit the default branch does NOT contain means this branch's bit state is still its own —
      // a live lane branch of ours, which is exactly what `close-pr` retires.
      if (!(await isAncestor(stateCommit, `origin/${defaultBranch}`))) return 'own-live';
      // The default branch does contain it, so the PR was merged. Deleting is only safe if the *tip* is in
      // there too; otherwise work was pushed after the merge and lives nowhere else.
      if (await isAncestor(`origin/${branch}`, `origin/${defaultBranch}`)) return 'own-merged';
      return 'own-superseded';
    } catch (e: any) {
      // Deliberately neutral wording: this answer no longer only decides whether a branch may be retired.
      // It also decides whether the branch counts as some lane's live mirror, which gates the branch-aliasing
      // and cross-scope mid-flight halts — so "it will be left alone rather than retired" would misdescribe
      // most of the runs that reach it. `inherited-or-none` is the do-nothing answer in every one of them.
      logger.consoleWarning(
        `Could not establish whether ${branch} is already merged into ${defaultBranch}, so its ownership ` +
          `could not be determined; treating it as inherited-or-none (no branch is retired, and the branch ` +
          `is not treated as any lane's live mirror): ${e?.message || e}`
      );
      return 'inherited-or-none';
    }
  }

  /**
   * The lane is gone from bit.cloud — close its PR, and retire the branch **if** the claim on it allows.
   *
   * `deleteBranch: false` is the keep path, reached from three shapes: `own-superseded` (the sync PR was
   * merged and then more commits were pushed to the branch), `own-live` with dev commits (the PR was never
   * merged, and the commits above the state commit never reached the lane), and `own-live` whose **tip the
   * reconciler did not write** (a developer's own `.bitmap`-touching commit — see the planner's `own-live`
   * case). The first two mean "there is work here that exists nowhere else"; the third means "we cannot
   * vouch for what is in the tip", and `keepReason` is what keeps the two sentences apart. Deleting the
   * branch would be the one irreversible thing this command can do.
   */
  private async executeClosePr({
    laneName,
    laneIdStr,
    branch,
    defaultBranch,
    pr,
    deleteBranch,
    keepReason,
  }: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
    pr?: PrInfo;
    deleteBranch: boolean;
    keepReason?: BranchKeepReason;
  }): Promise<string> {
    const { logger, gitHost } = this.deps;
    const keptBecause =
      keepReason === 'tip-not-a-sync-commit'
        ? `its tip is not one of this reconciler's own commits, so the work in it may exist nowhere else`
        : `it carries commits that are not in the default branch`;
    const closeComment = deleteBranch
      ? `Lane ${laneIdStr} was removed/archived on bit.cloud.`
      : `Lane ${laneIdStr} was removed/archived on bit.cloud. The branch \`${branch}\` is being kept: ` +
        `${keptBecause}.`;
    if (gitHost && pr) {
      logger.console(chalk.blue(`Closing PR #${pr.number} for removed lane ${laneIdStr}`));
      await gitHost.closePr(pr.number, closeComment);
    } else if (gitHost) {
      // Not an error: the PR may have been merged or closed by hand already, or never existed. Say so
      // explicitly, otherwise the run looks like it silently skipped the PR half of the cleanup.
      logger.console(
        chalk.yellow(
          `No open PR found for ${branch} — ${deleteBranch ? 'only retiring the branch' : 'nothing to close'}`
        )
      );
    } else {
      logger.console(chalk.yellow(`No configured git host provider — skipping PR close for ${branch}`));
    }

    if (!deleteBranch) {
      // The two keep reasons get two different console lines on purpose: a maintainer reading CI output for
      // "why is this branch still here" must not be told to go looking for unmerged commits when the real
      // answer is that a developer, not the reconciler, wrote the tip.
      if (keepReason === 'tip-not-a-sync-commit') {
        logger.console(
          chalk.yellow(
            `lane removed remotely, but ${branch}'s tip is not a bit ci sync commit — a developer wrote the ` +
              `branch's current bit state, so it is not safe to assume the branch is only our mirror; keeping it`
          )
        );
        return (
          `${laneName} -> close-pr (${pr ? `PR #${pr.number} closed` : 'no open PR'}, branch ${branch} kept: ` +
          `its tip was not written by bit ci sync)`
        );
      }
      logger.console(
        chalk.yellow(`lane removed remotely but branch carries unmerged commits; keeping branch ${branch}`)
      );
      return (
        `${laneName} -> close-pr (${pr ? `PR #${pr.number} closed` : 'no open PR'}, branch ${branch} kept: ` +
        `it carries commits missing from the default branch)`
      );
    }

    // Unconditional refusal for the two branches whose deletion is catastrophic — see `isProtectedBranch`.
    // Reaching this guard means something upstream is wrong; log it and keep the branch.
    if (isProtectedBranch(branch, defaultBranch, this.deps.cfg.mainSyncBranch)) {
      logger.consoleWarning(
        `Refusing to delete branch ${branch}: it is ${
          branch === defaultBranch ? 'the default branch' : 'the main sync branch'
        }, whatever the ownership evidence concluded`
      );
      return (
        `${laneName} -> close-pr (${pr ? `PR #${pr.number} closed` : 'no open PR'}, branch ${branch} kept: ` +
        `deleting it is never allowed)`
      );
    }

    // Deleting the remote branch is best-effort: it may be protected, or a human may have already
    // removed it. Neither is a reason to fail the whole sync run.
    let branchDeleted = true;
    try {
      // `:refs/heads/<branch>` — the empty-source delete refspec — rather than `--delete <branch>`. It
      // names the ref to remove in full, so there is no ambiguity about what is being deleted, and the
      // branch name can never be read as an option however it was configured.
      await git.push(['origin', `:refs/heads/${branch}`]);
    } catch (e: any) {
      branchDeleted = false;
      logger.consoleWarning(`Could not delete remote branch ${branch}: ${e?.message || e}`);
    }
    return `${laneName} -> close-pr (${pr ? `PR #${pr.number} closed` : 'no open PR'}, branch ${branch} ${
      branchDeleted ? 'deleted' : 'left in place'
    })`;
  }

  /**
   * Record a halt **without touching the PR on a dry run**.
   *
   * `--dry-run` promises that no pull request is created, closed, labelled or commented on, and a halt is
   * the one outcome that would otherwise break that promise — labelling a PR freezes its lane's syncs
   * until a human removes the label, which is a lasting side effect of a command that claimed to have
   * none. The line still carries `HALT_SUMMARY_PREFIX` either way, so the run still exits non-zero: the
   * halt is the *answer* to "what would this run do?", not a side effect of doing it.
   *
   * Every halt reached from a pre-planning refusal goes through here rather than calling `executeHalt`
   * directly, so the guard cannot be forgotten at one site and present at its sibling.
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
      logger.console(chalk.red(`Cannot sync lane ${laneIdStr} automatically: ${reason}`));
      logger.console(chalk.yellow('🏃 Dry-run: the PR is not labelled or commented on'));
      return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
    }
    return this.executeHalt({ laneName, laneIdStr, branch, reason, pr, commentNote });
  }

  /**
   * Hand the lane back to a human: label the PR so subsequent runs skip it (the planner treats
   * `bit-sync-conflict` as a hard no-op) and comment the resolution steps.
   *
   * `commentNote` replaces the default resolution steps for halts where they would be wrong — notably the
   * branch-aliasing halt, whose PR belongs to a *different* lane, and whose reader must not be told to
   * import the refused lane onto this branch.
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
    logger.console(chalk.red(`Cannot sync lane ${laneIdStr} automatically: ${reason}`));
    if (gitHost && pr) {
      try {
        await gitHost.addLabel(pr.number, CONFLICT_LABEL);
        await gitHost.comment(pr.number, haltCommentBody({ reason, branch, laneId: laneIdStr, note: commentNote }));
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
   *    result would be a `.bitmap`-only commit whose recorded state claims the branch mirrors the lane
   *    while its files still hold the default branch's content. Worse, that same short-circuit throws
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
    // Compare name AND scope (`toString()` is `<scope>/<name>`), so a same-named lane in another scope
    // can't masquerade as our lane.
    //
    // Read from `.bitmap`, not from the scope's lane object — see `workspace-lane.ts`. Cold, the object
    // read answers "main" for a branch already on the lane, which sends this method down the wrong path:
    // it skips the step-off to main, `switchLanes` then throws "already checked out" (which
    // `switchToLane` swallows as success), nothing is materialized, and the final check below fails with
    // a message blaming the switch. That is `import-lane` onto an existing branch — the commonest action
    // there is — broken on every fresh runner.
    const isOnTarget = () => currentLaneIdStr(this.deps.lanes) === target.toString();

    if (isOnTarget()) {
      logger.console(
        chalk.yellow(`Workspace is already on ${laneIdStr} — stepping off to main so the re-import actually runs`)
      );
      const toMainErr = await this.deps.ci.switchToLaneForSync('main');
      if (toMainErr) return toMainErr;
      if (isOnTarget()) {
        return new Error(`unable to leave lane ${laneIdStr} before re-importing it; the workspace is still on it`);
      }
    }

    const switchErr = await this.deps.ci.switchToLaneForSync(laneIdStr, { forceOurs: false, forceTheirs: true });
    if (switchErr) return switchErr;

    // `switchToLane` swallows "already checked out" as success, and a switch can also land somewhere
    // unexpected. Verify before the caller commits a `.bitmap` asserting this lane's content.
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
    // Explicit refspec, never the checkout's configured one — see `fetchRemoteHeads`. Everything below
    // reads branches through `origin/<branch>`, and this run enumerates them with `ls-remote`, which sees
    // branches a narrowed `remote.origin.fetch` would never give a remote-tracking ref.
    await fetchRemoteHeads();
    this.fetched = true;
  }

  /**
   * The remote lane's data, or undefined when the lane no longer exists on bit.cloud. Query by name
   * so the remote doesn't have to enumerate every lane in the scope.
   *
   * The remote queried is the lane's **hosting** scope, which is `defaultScope` for every lane this
   * repository owns and something else for an explicitly targeted, foreign-hosted lane. Asking
   * `defaultScope` for a lane it does not host answers "was not found", i.e. "the lane is gone" — the
   * input that drives `close-pr`, which deletes branches. Querying the host is what keeps that answer
   * truthful.
   */
  private async getRemoteLane(target: LaneTarget): Promise<LaneData | undefined> {
    const { hostScope, name } = target;
    const lanes = await this.deps.lanes.getLanes({ remote: hostScope, name }).catch((e) => {
      // "was not found" is the remote's way of saying the lane is gone — that's a legitimate state
      // (it drives the close-pr path), not an error.
      if (e.toString().includes('was not found')) return [];
      throw new Error(`Failed to read lane ${hostScope}/${name} from the remote: ${e.toString()}`);
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
      return !hasSyncMarker(message);
    });
    return entry?.message || `chore: sync ${branch} into the lane (from ${defaultBranch})`;
  }

  /**
   * Stage everything, commit with the annotated sync message, and push. Never force-pushes: the branch is
   * always fast-forwarded from the state we just checked out, so a rejected push means someone
   * pushed concurrently and the next run should re-plan from the new state rather than clobber it.
   *
   * `--allow-empty` is now only insurance against `git commit` failing the lane outright. Under the v2
   * (`.bitmap`-derived) state model it can no longer be load-bearing: every path that reaches here has just
   * changed `.bitmap` — `import-lane` materialized a lane the branch did not already record (or it would
   * have read as converged), and the export paths snapped, which always rewrites component versions. If a
   * commit here ever were empty it would record nothing, because the state is the file, not the message.
   */
  private async commitAllAndPush(branch: string, message: string) {
    await ensureGitIdentity();
    await addAllExceptScopeAndModules();
    await git.commit(message, undefined, { '--allow-empty': null });
    // `HEAD:refs/heads/<branch>` rather than the bare branch name: the destination is stated as a full
    // ref, so it cannot be resolved as a tag or any other ref that happens to share the name, and the
    // source is what we just committed rather than a second lookup of the same name. A configured branch
    // name is user input (see `ref-name.ts`); this is the other half of not letting it be reinterpreted.
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
      logger.console(chalk.yellow(`No configured git host provider — skipping PR creation for ${branch}`));
      return undefined;
    }
    // The lane page lives under the scope that HOSTS the lane, which is not necessarily this
    // repository's `defaultScope`.
    //
    // `replace('.', '/')` replaces only the FIRST dot, and that is correct rather than a latent bug: a
    // scope id may contain **at most one** dot. The grammar is
    // `@teambit/legacy-bit-id/utils/is-valid-scope-name.ts` — `/^[$\-_!a-z0-9]+[.]?[$\-_!a-z0-9]+$/`,
    // whose own comment reads "the '.' can be in the middle, not at the beginning and not at the end and
    // only once" — and it is enforced on every path that can introduce one (`BitId.parse`,
    // `bit init --default-scope`, workspace variants, the remote resolver). So there is never a second
    // dot to replace. This is also the platform's canonical spelling of the same conversion, used by
    // `ScopeUrl.toPathname` (`scopes/component/component-url/scope-url.ts`), `lane.cmd.ts` and
    // `export.main.runtime.ts`; `ScopeUrl` is not imported here because its barrel pulls in React
    // context, and it hardcodes bit.cloud where this must honour `getCloudDomain()`.
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
   * `git add -A`, and land on that lane's branch as part of that lane's state — content that state
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
      // `.bitmap`-derived (see `workspace-lane.ts`): cold, the scope-object read answers "main" for a
      // workspace that is really on a lane, and the switch back would be skipped. The forced checkout below
      // would still restore `.bitmap`, so this was benign — but "benign because something else cleans up"
      // is not a property worth keeping once the correct read costs nothing.
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
 * Whether a `filesStatus` entry from a checkout/merge result represents a conflict a human must
 * resolve. Compared against `FileStatus` rather than string literals because its values are
 * chalk-colored labels (`chalk.red('CONFLICT')`), not the keys the `FilesStatus` type suggests.
 * `deletedConflict` is included on top of the pair `merge-lanes` checks — a file deleted on one side
 * and modified on the other is no less a conflict.
 */
function isConflictFileStatus(status: string): boolean {
  return status === FileStatus.manual || status === FileStatus.binaryConflict || status === FileStatus.deletedConflict;
}

/**
 * The body of the pull request that mirrors a lane onto a branch.
 *
 * A pure function of the lane, separate from `openPrForLane`, because its one non-obvious property — that
 * the body stays well inside a git host's size limit however large the lane is — is worth asserting
 * directly, and cannot be if it is only reachable through a method that needs a workspace and a network.
 *
 * The component list is capped; the **total** next to it is not, and neither is the lane head, so a
 * reader of a truncated list can still tell how much they are not seeing and follow the lane link for the
 * rest.
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
 * exact resolution instructions posted on a halted PR (kept verbatim; only the fields interpolate).
 *
 * `note` replaces the default steps for halts where they do not apply. The default assumes the PR belongs
 * to `laneId` — it tells the reader to import that lane onto this branch — which is true of every halt
 * except the branch-aliasing one, where following it would do the very overwrite the halt just refused.
 */
function haltCommentBody({
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
  git fetch origin && git checkout ${branch}
  bit lane import ${laneId}
  # resolve conflicts, commit the result, then:
  git push origin ${branch}`;
  return `bit-git-sync could not reconcile this branch automatically: ${reason}

${resolution}

Remove the \`bit-sync-conflict\` label to resume syncing.
`;
}
