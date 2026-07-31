import chalk from 'chalk';
import type { Logger } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import type { CheckoutMain } from '@teambit/checkout';
import { git } from '../git';
import type { CiMain } from '../ci.main.runtime';
import type { CiSyncConfig } from './sync-config';
import { SYNC_COMMIT_MARKER } from './sync-state';
import { currentLaneIdStr } from './workspace-lane';
import type { GitHostProvider } from './git-host-provider';
import { HALT_SUMMARY_PREFIX, capEntries } from './lane-sync-executor';
import {
  addAllExceptScopeAndModules,
  branchExistsOnRemote,
  checkoutPristine,
  checkoutPristineRestore,
  ensureGitIdentity,
  fetchRemoteHeads,
  isNonContentPath,
} from './git-ops';

export type MainSyncDeps = {
  checkout: CheckoutMain;
  lanes: LanesMain;
  /** for reloadWorkspaceFromDisk + switchToLaneForSync */
  ci: CiMain;
  logger: Logger;
  /**
   * The git host serving `origin`, resolved from the registered providers (see `git-host-provider.ts`).
   * undefined => no provider claimed the remote, or the one that did has no credentials; every PR
   * operation is then logged and skipped, and the git half of the sync still runs.
   */
  gitHost?: GitHostProvider;
  cfg: Required<CiSyncConfig>;
  defaultBranch: string;
  defaultScope: string;
};

/**
 * Reconcile the *main scope* with the repository's default branch.
 *
 * Unlike lane sync there is no state to record: the main scope's heads and the repository's tree are
 * compared directly. `bit checkout head` writes the latest exported versions into the working tree, so
 * an empty `git status` afterwards **is** convergence, and any diff **is** the drift. That makes the
 * whole operation idempotent and stateless — no trailer, no fingerprint, nothing to keep in sync with
 * the lane-side bookkeeping.
 *
 * Under the default `mainSync: 'pr'` the convergence is proposed rather than applied: the result is a
 * commit on `cfg.mainSyncBranch` and a pull request against the default branch, which is never written
 * to directly. Under `mainSync: 'direct-push'` the same drift commit lands on the default branch itself
 * and is pushed — plain push, so a default branch that moved mid-run rejects it rather than being
 * clobbered. Nothing is ever force-pushed in either mode.
 */
/** the "nothing to do" line, shared by both modes so a converged run reads the same either way */
const CONVERGED_SUMMARY = 'main -> converged (checkout head produced no changes)';

export class MainSyncExecutor {
  constructor(private deps: MainSyncDeps) {}

  /**
   * Returns a single human-readable summary line. On a failure the line starts with
   * `HALT_SUMMARY_PREFIX` so the caller can aggregate it with the lane summaries and exit non-zero;
   * like `syncLane`, it does not throw — a main-sync failure must not erase the lane results
   * collected before it in the same run.
   */
  async syncMain(opts: { dryRun?: boolean } = {}): Promise<string> {
    const { cfg, defaultBranch, defaultScope, logger } = this.deps;
    const directPush = cfg.mainSync === 'direct-push';
    // In direct-push mode the drift is committed where it is measured: on the default branch. The sync
    // branch (and its PR) is not consulted, moved or deleted — a leftover `mainSyncBranch` from a
    // previous 'pr'-mode run is a human's to deal with, not this run's.
    const branch = directPush ? defaultBranch : cfg.mainSyncBranch;

    if (cfg.autoMergeMainSyncPr && !directPush) {
      // Say so rather than silently ignoring the setting: enabling auto-merge is host-specific
      // (on GitHub, the `enablePullRequestAutoMerge` GraphQL mutation) and is not part of the
      // `GitHostProvider` contract, so the provider-agnostic engine has no way to ask for it.
      logger.consoleWarning(
        `sync.autoMergeMainSyncPr is enabled in the config, but enabling auto-merge is not implemented yet — ` +
          `the sync PR is opened without it. Use a repository auto-merge rule instead.`
      );
    }

    try {
      // Explicit refspec, never the checkout's configured one — see `fetchRemoteHeads`. This path reads
      // `origin/<defaultBranch>` and `origin/<mainSyncBranch>`, and a single-branch clone gives a
      // remote-tracking ref for at most one of them.
      await fetchRemoteHeads();
      // Direct-push always starts from `origin/<defaultBranch>` — the very tip the plain push must
      // fast-forward, so drift measured against anything else (a stale local default branch included)
      // would either be rejected or, worse, quietly re-propose already-pushed state.
      const syncBranchExists = directPush ? false : await branchExistsOnRemote(branch);
      // Start from the existing sync branch when there is one, so its history (and any review
      // discussion attached to the open PR) survives across runs; otherwise fork from the default
      // branch.
      const startPoint = syncBranchExists ? `origin/${branch}` : `origin/${defaultBranch}`;
      logger.console(
        chalk.blue(
          directPush
            ? `main -> checking the main scope against ${defaultBranch} (direct-push)`
            : `main -> checking the main scope against ${defaultBranch} (sync branch ${branch})`
        )
      );

      await this.resetToStartPoint(branch, startPoint);

      if (syncBranchExists) {
        // The existing sync branch may be behind the default branch — its PR may even have been merged
        // already, in which case the branch is stale. Catching up matters for two concrete reasons:
        // the PR has to stay *mergeable* (a branch that conflicts with its base can't be merged), and
        // `checkout head` writes component files over whatever tree it finds, so running it on a stale
        // tree re-commits the pre-merge content of every file that the default branch has changed since
        // — clobbering those changes on this branch. A merge (never a rebase, never a force-push) is
        // the only non-destructive way to move a branch that already has an open PR.
        const catchUpErr = await this.catchUpWithDefaultBranch(branch);
        if (catchUpErr) return `${HALT_SUMMARY_PREFIX} main -> ${catchUpErr}`;
      }

      // `checkout head` resolves versions against *the current lane*. The sync branch forks from the
      // default branch, whose `.bitmap` is on main, so this should never fire — but if it does (a
      // hand-edited `.bitmap`, a lane pointer committed to the default branch by mistake), the diff
      // this run would compute is the lane's content, not the main scope's. Refuse rather than open a
      // wildly wrong PR.
      //
      // `.bitmap`-derived (see `workspace-lane.ts`), and here that is the difference between a guard and a
      // decoration. The scope-object read answers "main" whenever the lane object is not cached locally —
      // which on a fresh CI runner is *always* — so this refusal would silently stop refusing in exactly
      // the environment it ships in, and the run would go on to compute the lane's content as main-scope
      // drift and open the wildly wrong PR this exists to prevent.
      const currentLane = currentLaneIdStr(this.deps.lanes);
      if (currentLane) {
        return (
          `${HALT_SUMMARY_PREFIX} main -> the .bitmap on ${startPoint} points at lane ` +
          `"${currentLane}" rather than main, so the main-scope drift cannot be computed`
        );
      }

      // `checkoutByCLIValues` rather than `checkout`: it runs `importer.importCurrentObjects()` first
      // (so `head` resolves to the versions currently on the *remote* scope rather than whatever this
      // clone happens to have) and ends with `consumer.onDestroy`, which persists `.bitmap`. Bare
      // `checkout()` does neither — `mergePr` has to call `bitMap.write()` by hand right after it, and
      // a `.bitmap` left unwritten would silently drop the version bumps from the drift diff.
      //
      // `includeNewFromScope` closes the under-mirroring hole: `ensureCheckoutConfiguration` derives
      // its ids from `workspace.listIds()`, so a component that was exported to the scope's main but
      // never added to this repo's `.bitmap` (created from another workspace, or on bit.cloud) would
      // otherwise be invisible to every sync run forever. With the flag, `getNewComponentsFromScope`
      // lists the default scope and writes those components into the workspace, so the sync PR adds
      // them to git. See the shared-scope caveat in the class docs of the report.
      //
      // `mergeStrategy: 'theirs'` is required, not cosmetic. A component whose files on the sync
      // branch differ from the version its `.bitmap` records — ordinary unexported source drift on the
      // default branch — is *modified*, so `getComponentStatusBeforeMergeAttempt` computes a real
      // three-way merge, and with no strategy `checkout` throws
      // `automatic merge has failed … please use "--auto-merge-resolve"`. That message would land
      // verbatim in the HALTED summary, telling the user about a flag `bit ci sync` does not have.
      // 'theirs' resolves conflicted files from the scope's main, which is what this PR is *for*:
      // materializing the exported truth. If that reverts unexported git drift, the reversion is
      // visible in the PR diff and a human rejects it. 'ours' is forbidden — it would advance
      // `.bitmap` to the new versions while keeping the old files, i.e. a commit asserting a state the
      // tree does not have (the same class of lie as the Task 6 critical finding). `promptMergeOptions`
      // stays unset: prompting in CI would hang.
      const results = await this.deps.checkout.checkoutByCLIValues('', {
        head: true,
        skipNpmInstall: true,
        includeNewFromScope: true,
        mergeStrategy: 'theirs',
      });
      const newFromScope = results.newFromScope ?? [];
      if (newFromScope.length) {
        logger.console(
          chalk.blue(
            `Added ${newFromScope.length} component(s) that exist on ${defaultScope}'s main but not in this ` +
              `workspace: ${newFromScope.join(', ')}`
          )
        );
      }

      const drift = await this.driftFiles();
      // The direct-push converged line stays bare: the PR annotation exists because in 'pr' mode a
      // converged sync branch can still differ from the default branch until the PR merges — a gap
      // direct-push does not have, and asking the host about `mainSyncBranch`'s PR here would be the
      // one interaction with it this mode promises not to make.
      if (!drift.length) return directPush ? CONVERGED_SUMMARY : await this.convergedSummary(branch);

      logger.console(chalk.yellow(`main -> drift in ${drift.length} file(s): ${drift.slice(0, 20).join(', ')}`));

      if (opts.dryRun) {
        // Nothing is committed, pushed, or reported to the git host. The working tree *was* written (a
        // diff-based check has no other way to learn the answer) and `finally` restores it.
        logger.console(
          chalk.yellow(
            directPush
              ? `🏃 Dry-run: main -> would push the drift directly onto ${branch}`
              : `🏃 Dry-run: main -> would push ${branch} and open a sync PR`
          )
        );
        return directPush
          ? `main -> drift detected in ${drift.length} file(s) — would push ${branch} directly`
          : `main -> drift detected in ${drift.length} file(s) — would open sync PR`;
      }

      await ensureGitIdentity();
      await addAllExceptScopeAndModules();
      await git.commit(mainSyncCommitMessage(drift.length));
      // Never force: we started from the branch tip we fetched and only added commits on top, so a
      // rejected push means a concurrent run pushed in between — the next run re-plans from the new
      // state rather than clobbering it. In direct-push mode that rejection is the whole safety story
      // (the branch being written is the default branch), so it surfaces as a HALTED summary and is
      // never retried or forced.
      // Unambiguous refspec — see the matching push in `lane-sync-executor.commitAllAndPush`.
      await git.push(['origin', `HEAD:refs/heads/${branch}`]);
      logger.console(chalk.green(`Pushed ${branch}`));

      if (directPush) {
        const shortSha = (await git.revparse(['--short', 'HEAD'])).trim();
        return `main -> direct-push (pushed ${branch} @ ${shortSha})`;
      }
      const prUrl = await this.ensureSyncPr({ branch, driftCount: drift.length, newFromScope });
      return `main -> pushed sync commit to ${branch}${prUrl ? ` (PR ${prUrl})` : ''}`;
    } catch (e: any) {
      // Same contract as the lane executor: report the failure as a HALTED summary line so the run
      // exits non-zero with every other line intact, instead of throwing out of the middle of a
      // multi-target sync.
      return `${HALT_SUMMARY_PREFIX} main -> ${e?.message || e}`;
    } finally {
      await this.restoreWorkspace();
    }
  }

  /**
   * Put the working tree on the sync branch at a *pristine* copy of `startPoint`.
   *
   * Both the force-checkout and the clean are load-bearing for a diff-based reconciler: any
   * pre-existing modification or stray untracked file in the workspace would be indistinguishable
   * from main-scope drift and would be committed into the sync PR. Nothing is lost that isn't already
   * on `origin` — this is only ever a checkout, never a push.
   *
   * The reload is what makes the following `checkout head` read *this* branch's `.bitmap` (its
   * per-component versions and lane pointer) rather than the copy the process loaded at startup.
   */
  private async resetToStartPoint(branch: string, startPoint: string) {
    await checkoutPristine(branch, startPoint, () => this.deps.ci.reloadWorkspaceFromDisk());
  }

  /**
   * Merge the default branch into the sync branch, so the drift is computed against the repository's
   * current state. Returns a reason string on failure (the caller turns it into a HALTED summary)
   * rather than throwing.
   *
   * A conflict here means the sync branch and the default branch edited the same lines — a human has
   * to decide, and the safe recovery is to let them (or to delete the sync branch, which makes the
   * next run fork a fresh one from the default branch).
   */
  private async catchUpWithDefaultBranch(branch: string): Promise<string | undefined> {
    const { defaultBranch, logger } = this.deps;
    await ensureGitIdentity();
    try {
      const out = await git.raw(['merge', '--no-edit', `origin/${defaultBranch}`]);
      logger.console(chalk.blue(`Brought ${branch} up to date with origin/${defaultBranch}: ${out.trim()}`));
    } catch (e: any) {
      await git.raw(['merge', '--abort']).catch(() => undefined);
      return (
        `could not bring the sync branch ${branch} up to date with origin/${defaultBranch}: ${e?.message || e}. ` +
        `Resolve or delete ${branch} (a deleted sync branch is re-forked from ${defaultBranch} on the next run)`
      );
    }
    // The merge may have brought a new `.bitmap` in from the default branch.
    await this.deps.ci.reloadWorkspaceFromDisk();
    return undefined;
  }

  /**
   * The "nothing to do" summary line — plus, when a sync PR is still open, the fact that it is.
   *
   * The checkout ran on the *sync branch*, so no drift means the sync branch matches the scope. The
   * default branch does not, if the PR proposing that convergence hasn't been merged: a bare "converged"
   * would read as full agreement between the repository and the scope while the difference sits in a
   * pull request awaiting review.
   */
  private async convergedSummary(branch: string): Promise<string> {
    const { gitHost } = this.deps;
    if (!gitHost) return CONVERGED_SUMMARY;
    const pr = await gitHost.findPrByBranch(branch).catch(() => undefined);
    return pr ? `${CONVERGED_SUMMARY} — open sync PR #${pr.number} still awaits review/merge` : CONVERGED_SUMMARY;
  }

  /**
   * The files `bit checkout head` changed, i.e. the drift. Excludes the local bit scope and installed
   * packages (see `isNonContentPath`) so they can never be mistaken for main-scope drift — the same
   * paths `cleanUntrackedScoped` and `addAllExceptScopeAndModules` refuse to touch, which is what keeps
   * "what counts as drift" and "what gets committed" the same set.
   */
  private async driftFiles(): Promise<string[]> {
    const status = await git.status();
    const paths = status.files.map((file) => file.path).filter((path) => !isNonContentPath(path));
    return [...new Set(paths)];
  }

  /**
   * Make sure the pushed branch has an open PR. A git-host failure only warns: the branch is pushed,
   * which is the load-bearing half, and the next run retries the PR.
   */
  private async ensureSyncPr({
    branch,
    driftCount,
    newFromScope,
  }: {
    branch: string;
    driftCount: number;
    newFromScope: string[];
  }): Promise<string | undefined> {
    const { gitHost, logger, defaultBranch } = this.deps;
    if (!gitHost) {
      logger.consoleWarning(
        'No configured git host provider (for GitHub: BIT_GITHUB_TOKEN or GITHUB_TOKEN, plus a repository) — ' +
          'pushed sync branch, skipping PR operations'
      );
      return undefined;
    }
    try {
      const existing = await gitHost.findPrByBranch(branch);
      if (existing) {
        logger.console(chalk.blue(`Sync PR ${existing.htmlUrl} is already open — pushed the new commit onto it`));
        return existing.htmlUrl;
      }
      const created = await gitHost.createPr({
        head: branch,
        base: defaultBranch,
        title: 'Bit sync: update to latest main scope versions',
        body: mainSyncPrBody({ driftCount, newFromScope }),
      });
      logger.console(chalk.green(`Opened sync PR ${created.htmlUrl}`));
      return created.htmlUrl;
    } catch (e: any) {
      logger.consoleWarning(`Could not open or find the sync PR for ${branch}: ${e?.message || e}`);
      return undefined;
    }
  }

  /**
   * Leave git on the default branch and bit on main, so the next target in the run (or the developer
   * running this interactively) starts where it expects to. Mirrors
   * `LaneSyncExecutor.restoreWorkspace`: best-effort and warn-only, so a restore hiccup can't throw
   * out of a `finally` and mask the real error.
   *
   * The clean is what discards the *untracked* files `checkout head` wrote (new component
   * directories) on the converged and dry-run paths; on the pushed path they were committed, so the
   * forced checkout removes them by itself. The reload is what stops the sync branch's `.bitmap` from
   * staying in the live workspace after the git checkout swapped it on disk.
   */
  private async restoreWorkspace() {
    const { logger, defaultBranch } = this.deps;
    try {
      // `.bitmap`-derived for the same reason as its sibling in `lane-sync-executor` — see
      // `workspace-lane.ts`.
      if (currentLaneIdStr(this.deps.lanes)) {
        const switchErr = await this.deps.ci.switchToLaneForSync('main');
        if (switchErr) logger.consoleWarning(`Could not switch the workspace back to main: ${switchErr.message}`);
      }
      await checkoutPristineRestore(defaultBranch, () => this.deps.ci.reloadWorkspaceFromDisk());
    } catch (e: any) {
      logger.consoleWarning(`Could not restore the workspace after the main sync: ${e?.message || e}`);
    }
  }
}

/**
 * The sync commit message. The `[bit-sync]` marker is what lets triggers (and humans) recognize the
 * commit as machine-generated; unlike a lane sync commit it carries no `Bit-Lane-Head` trailer,
 * because main sync keeps no state — the next run recomputes the drift from scratch.
 */
function mainSyncCommitMessage(driftCount: number): string {
  return [
    `chore(bit-sync): sync git to latest main scope versions (${driftCount} file(s))`,
    '',
    SYNC_COMMIT_MARKER,
  ].join('\n');
}

function mainSyncPrBody({ driftCount, newFromScope }: { driftCount: number; newFromScope: string[] }): string {
  const lines = [
    'Automated sync PR: the Bit scope moved ahead of this repository. This PR checks the workspace out to the ' +
      'latest exported versions (`bit checkout head --auto-merge-resolve theirs`).',
    '',
    `- files changed: ${driftCount}`,
    '- conflicts between this repository and the scope were resolved **in favour of the scope** — if a file here ' +
      'held changes that were never exported to Bit, this PR reverts them. Review the diff and close the PR ' +
      'instead of merging if that is not what you want.',
  ];
  if (newFromScope.length) {
    lines.push(
      `- components added from the scope (${newFromScope.length}, not previously in this repository's \`.bitmap\`):`,
      // Bounded for the same reason as the lane PR body: a first sync of a large scope adds every
      // component at once, and an over-long body is rejected by the host outright.
      ...capEntries(
        newFromScope.map((id) => `  - \`${id}\``),
        '  - '
      )
    );
  }
  lines.push(
    '',
    'This PR is maintained by `bit ci sync` — re-running the command pushes any further drift onto the same branch.'
  );
  return lines.join('\n');
}
