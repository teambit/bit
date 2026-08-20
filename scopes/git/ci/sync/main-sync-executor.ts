import chalk from 'chalk';
import { formatWarningSummary } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import type { CheckoutMain } from '@teambit/checkout';
import type { Workspace } from '@teambit/workspace';
import { git } from '../git';
import type { CiMain } from '../ci.main.runtime';
import type { CiSyncConfig } from './sync-config';
import { SYNC_COMMIT_MARKER, isSyncAuthoredMessage } from './sync-state';
import { currentLaneIdStr } from './workspace-lane';
import type { MainFileHeal } from './heal-missing-main-files';
import { healMissingMainFiles } from './heal-missing-main-files';
import type { GitHostProvider } from './git-host-provider';
import { HALT_SUMMARY_PREFIX, capEntries } from './lane-sync-executor';
import {
  addAllExceptScopeAndModules,
  branchExistsOnRemote,
  checkoutPristine,
  checkoutPristineRestore,
  commitWithIdentity,
  confirmPushRace,
  dropLocalBranchToRemoteTip,
  fetchRemoteHeads,
  gitWithIdentity,
  isNonContentPath,
  isStaleLeaseRejection,
  redactUrlCredentials,
} from './git-ops';

export type MainSyncDeps = {
  checkout: CheckoutMain;
  lanes: LanesMain;
  /** for the pre-checkout `.bitmap` heal (see `heal-missing-main-files`) */
  workspace: Workspace;
  /** for reloadWorkspaceFromDisk + switchToLaneForSync */
  ci: CiMain;
  logger: Logger;
  /** undefined => PR operations are logged and skipped; the git half of the sync still runs. */
  gitHost?: GitHostProvider;
  cfg: Required<CiSyncConfig>;
  defaultBranch: string;
  defaultScope: string;
};

/**
 * Reconcile the main scope with the repository's default branch. Stateless: `bit checkout head`
 * writes the latest exported versions, so an empty `git status` IS convergence and any diff IS the
 * drift. Under 'pr' the convergence is proposed via `mainSyncBranch`; under 'direct-push' it lands on
 * the default branch with a plain push. One force push exists: a machine-owned sync branch that
 * conflicts with the default branch is re-forked under a tip lease (`reforkIfMachineOwned`).
 */
/** the "nothing to do" line, shared by both modes */
const CONVERGED_SUMMARY = 'main -> converged (checkout head produced no changes)';

export class MainSyncExecutor {
  constructor(private deps: MainSyncDeps) {}

  /**
   * Returns a summary line (HALT-prefixed on failure) and, like `syncLane`, does not throw — a
   * main-sync failure must not erase the lane results collected before it.
   */
  async syncMain(opts: { dryRun?: boolean } = {}): Promise<string> {
    const { cfg, defaultBranch, defaultScope, logger } = this.deps;
    const directPush = cfg.mainSync === 'direct-push';
    // In direct-push mode the sync branch (and its PR) is not consulted, moved or deleted.
    const branch = directPush ? defaultBranch : cfg.mainSyncBranch;

    if (cfg.autoMergeMainSyncPr && !directPush) {
      // Enabling auto-merge is host-specific and not part of the GitHostProvider contract.
      logger.consoleWarning(
        `sync.autoMergeMainSyncPr is enabled in the config, but enabling auto-merge is not implemented yet — ` +
          `the sync PR is opened without it. Use a repository auto-merge rule instead.`
      );
    }

    try {
      await fetchRemoteHeads();
      // Direct-push always starts from `origin/<defaultBranch>` — the very tip the plain push must
      // fast-forward. In 'pr' mode an existing sync branch is reused so its PR history survives.
      const syncBranchExists = directPush ? false : await branchExistsOnRemote(branch);
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
        // Catch up with the default branch: the PR must stay mergeable, and `checkout head` on a stale
        // tree would re-commit pre-merge content over the default branch's changes.
        const catchUpErr = await this.catchUpWithDefaultBranch(branch);
        if (catchUpErr) {
          const refork = await this.reforkIfMachineOwned(branch);
          if (refork === 'human-owned') return `${HALT_SUMMARY_PREFIX} main -> ${catchUpErr}`;
          if (refork === 'raced') return racedMainSummary(branch);
        }
      }

      // `checkout head` resolves versions against the CURRENT lane; a lane pointer on this branch
      // would make the "drift" the lane's content. Refuse rather than open a wildly wrong PR.
      // `.bitmap`-derived read: the scope-object read answers "main" on a fresh runner and the guard
      // would silently stop refusing exactly where it ships (see `workspace-lane.ts`).
      const currentLane = currentLaneIdStr(this.deps.lanes);
      if (currentLane) {
        return (
          `${HALT_SUMMARY_PREFIX} main -> the .bitmap on ${startPoint} points at lane ` +
          `"${currentLane}" rather than main, so the main-scope drift cannot be computed`
        );
      }

      // An entry whose recorded main file is gone cannot be loaded, and one of those fails the whole
      // checkout below. Heal them first (repoint the entry, or untrack it so `includeNewFromScope`
      // re-imports it). Reported so the sync PR explains the `.bitmap` lines it carries.
      const healedMainFiles = await healMissingMainFiles(this.deps.workspace, logger);

      // `checkoutByCLIValues` rather than `checkout`: it imports current objects first (so `head`
      // resolves to the remote scope's versions) and persists `.bitmap` on destroy.
      // `includeNewFromScope`: a component exported to the scope's main but never in this repo's
      // `.bitmap` would otherwise be invisible to every sync run forever.
      // `mergeStrategy: 'theirs'` is required: unexported source drift makes components "modified",
      // and with no strategy the checkout throws. 'theirs' materializes the exported truth — any
      // reversion of unexported drift is visible in the PR diff. 'ours' is forbidden: it would advance
      // `.bitmap` while keeping the old files, a commit asserting a state the tree does not have.
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
      // Direct-push stays bare: asking the host about `mainSyncBranch`'s PR would be the one
      // interaction with it this mode promises not to make.
      if (!drift.length) return directPush ? CONVERGED_SUMMARY : await this.convergedSummary(branch);

      logger.console(
        formatWarningSummary(`main -> drift in ${drift.length} file(s): ${drift.slice(0, 20).join(', ')}`)
      );

      if (opts.dryRun) {
        // The working tree WAS written (a diff-based check has no other way); `finally` restores it. Safe
        // only because a dry run over a dirty tree is refused before anything runs — the restore rewinds
        // to HEAD, so an uncommitted change here would be gone (`assertCleanForDryRun`).
        logger.console(
          formatWarningSummary(
            directPush
              ? `Dry-run: main -> would push the drift directly onto ${branch}`
              : `Dry-run: main -> would push ${branch} and open a sync PR`
          )
        );
        return directPush
          ? `main -> drift detected in ${drift.length} file(s) — would push ${branch} directly`
          : `main -> drift detected in ${drift.length} file(s) — would open sync PR`;
      }

      await addAllExceptScopeAndModules();
      await commitWithIdentity(mainSyncCommitMessage(drift.length));
      // The local knowledge of `origin/<branch>` — the tip this run built on; after a rejection it is
      // the baseline `confirmPushRace` checks the re-fetched remote against.
      const baseSha = await git
        .revparse([`origin/${branch}`])
        .then((sha) => sha.trim() || undefined)
        .catch(() => undefined);
      // Never force. Unambiguous refspec — see `lane-sync-executor.commitAllAndPush`. A rejection means
      // a concurrent run pushed in between; what happens next depends on the mode. Direct-push: the
      // rejection IS the default branch's safety story — stay loud, never swallow. 'pr' mode: the push
      // targets the machine-owned sync branch, where a concurrent-run overlap is the same benign race
      // the lane executor tolerates (`reforkIfMachineOwned` already defers the same way) — confirm it
      // and defer.
      try {
        await git.push(['origin', `HEAD:refs/heads/${branch}`]);
      } catch (e: any) {
        const message = String(e?.message || e);
        if (directPush || (await confirmPushRace(branch, baseSha, message)) !== 'confirmed-race') throw e;
        // Drop the losing commit: left on the local sync branch, its orphan sibling would trip the
        // next run's `checkoutPristine` guard. The original rejection text is kept for diagnosability.
        const dropErr = await dropLocalBranchToRemoteTip(branch);
        if (dropErr) {
          logger.consoleWarning(`Could not drop the unpushed sync commit on ${branch}: ${dropErr}`);
        }
        logger.console(
          formatWarningSummary(`main -> push to ${branch} lost to a concurrent run: ${redactUrlCredentials(message)}`)
        );
        return racedMainSummary(branch);
      }
      logger.console(chalk.green(`Pushed ${branch}`));

      if (directPush) {
        const shortSha = (await git.revparse(['--short', 'HEAD'])).trim();
        return `main -> direct-push (pushed ${branch} @ ${shortSha})`;
      }
      const prUrl = await this.ensureSyncPr({ branch, driftCount: drift.length, newFromScope, healedMainFiles });
      return `main -> pushed sync commit to ${branch}${prUrl ? ` (PR ${prUrl})` : ''}`;
    } catch (e: any) {
      // Same contract as the lane executor: a HALTED line, never a throw mid-run.
      return `${HALT_SUMMARY_PREFIX} main -> ${e?.message || e}`;
    } finally {
      await this.restoreWorkspace();
    }
  }

  /**
   * Put the working tree on the sync branch at a pristine copy of `startPoint`. Pristine is
   * load-bearing for a diff-based reconciler: any stray modification would be indistinguishable from
   * main-scope drift. The reload makes `checkout head` read this branch's `.bitmap`.
   */
  private async resetToStartPoint(branch: string, startPoint: string) {
    await checkoutPristine(branch, startPoint, () => this.deps.ci.reloadWorkspaceFromDisk());
  }

  /**
   * Merge the default branch into the sync branch so drift is computed against the repository's
   * current state. Returns a reason string on failure; a conflict needs a human (or deleting the sync
   * branch, which the next run re-forks).
   */
  private async catchUpWithDefaultBranch(branch: string): Promise<string | undefined> {
    const { defaultBranch, logger } = this.deps;
    try {
      // the marker line keeps the branch machine-owned across catch-up merges
      const out = await gitWithIdentity([
        'merge',
        '-m',
        `merge origin/${defaultBranch} into ${branch}\n\n${SYNC_COMMIT_MARKER}`,
        `origin/${defaultBranch}`,
      ]);
      // simple-git resolves on some non-zero exits — judge the merge by state, not by rejection
      const conflicted = (await git.status()).conflicted;
      if (conflicted.length) throw new Error(`merge conflicts in: ${conflicted.join(', ')}`);
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
   * Re-fork the sync branch from the default branch when every commit it holds beyond it passes
   * `isSyncAuthoredMessage` — machine state is recomputable from the scope. The force push is
   * leased on the tip the ownership was read from, so a concurrent run's push wins the race.
   */
  private async reforkIfMachineOwned(branch: string): Promise<'re-forked' | 'raced' | 'human-owned'> {
    const { defaultBranch, logger } = this.deps;
    const staleTip = (await git.revparse([`origin/${branch}`])).trim();
    const log = await git.raw(['log', `origin/${defaultBranch}..${staleTip}`, '--format=%B%x1e']);
    const messages = log
      .split('\x1e')
      .map((message) => message.trim())
      .filter(Boolean);
    const machineOwned = messages.length > 0 && messages.every((message) => isSyncAuthoredMessage(message));
    if (!machineOwned) return 'human-owned';
    logger.console(
      formatWarningSummary(
        `main -> ${branch} conflicts with ${defaultBranch} and carries only ${SYNC_COMMIT_MARKER} commits — ` +
          `re-forking it from origin/${defaultBranch}`
      )
    );
    await this.resetToStartPoint(branch, `origin/${defaultBranch}`);
    try {
      await git.push([`--force-with-lease=refs/heads/${branch}:${staleTip}`, 'origin', `HEAD:refs/heads/${branch}`]);
    } catch (e: any) {
      if (!isStaleLeaseRejection(e?.message || String(e))) throw e;
      logger.console(formatWarningSummary(`main -> ${branch} moved while re-forking — another run owns it now`));
      return 'raced';
    }
    return 're-forked';
  }

  /**
   * The "nothing to do" line — plus the open sync PR, if any: converged means the SYNC branch matches
   * the scope, and the default branch may still differ until that PR merges.
   */
  private async convergedSummary(branch: string): Promise<string> {
    const { gitHost } = this.deps;
    if (!gitHost) return CONVERGED_SUMMARY;
    const pr = await gitHost.findPrByBranch(branch).catch(() => undefined);
    return pr ? `${CONVERGED_SUMMARY} — open sync PR #${pr.number} still awaits review/merge` : CONVERGED_SUMMARY;
  }

  /**
   * The files `bit checkout head` changed, i.e. the drift. Excludes `.bit`/`node_modules` — the same
   * set the commit paths refuse to touch, keeping "counts as drift" and "gets committed" identical.
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
    healedMainFiles,
  }: {
    branch: string;
    driftCount: number;
    newFromScope: string[];
    /** `.bitmap` entries whose stale main file this run repaired; see the PR body */
    healedMainFiles: MainFileHeal[];
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
        body: mainSyncPrBody({ driftCount, newFromScope, healedMainFiles }),
      });
      logger.console(chalk.green(`Opened sync PR ${created.htmlUrl}`));
      return created.htmlUrl;
    } catch (e: any) {
      logger.consoleWarning(`Could not open or find the sync PR for ${branch}: ${e?.message || e}`);
      return undefined;
    }
  }

  /**
   * Leave git on the default branch and bit on main. Mirrors `LaneSyncExecutor.restoreWorkspace`:
   * best-effort and warn-only so a restore hiccup can't throw out of a `finally` and mask the real
   * error; the clean discards untracked files `checkout head` wrote on the converged/dry-run paths.
   */
  private async restoreWorkspace() {
    const { logger, defaultBranch } = this.deps;
    try {
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

/** The deferral line both raced shapes share: the catch-up refork race and the sync-branch push race. */
function racedMainSummary(branch: string): string {
  return `main -> ${branch} was updated by a concurrent run — deferring to it`;
}

/** The sync commit message: no `Bit-Lane-Head` trailer — main sync keeps no state. */
function mainSyncCommitMessage(driftCount: number): string {
  return [
    `chore(bit-sync): sync git to latest main scope versions (${driftCount} file(s))`,
    '',
    SYNC_COMMIT_MARKER,
  ].join('\n');
}

function mainSyncPrBody({
  driftCount,
  newFromScope,
  healedMainFiles = [],
}: {
  driftCount: number;
  newFromScope: string[];
  healedMainFiles?: MainFileHeal[];
}): string {
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
      // Bounded like the lane PR body: an over-long body is rejected by the host outright.
      ...capEntries(
        newFromScope.map((id) => `  - \`${id}\``),
        '  - '
      )
    );
  }
  if (healedMainFiles.length) {
    lines.push(
      `- components whose \`.bitmap\` entry named a main file that no longer exists here ` +
        `(${healedMainFiles.length}); the entry was repaired so the component can be loaded again:`,
      ...capEntries(
        healedMainFiles.map((heal) =>
          heal.retargetedTo
            ? `  - \`${heal.id}\` — main file repointed to \`${heal.retargetedTo}\``
            : `  - \`${heal.id}\` — re-imported from the scope (no usable main file was left here)`
        ),
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
