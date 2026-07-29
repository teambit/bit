import chalk from 'chalk';
import type { Logger } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import type { LaneData } from '@teambit/legacy.scope';
import { getCloudDomain } from '@teambit/legacy.constants';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { git } from '../git';
import type { CiMain } from '../ci.main.runtime';
import type { CiSyncConfig } from './sync-config';
import { laneNameToBranch } from './sync-config';
import { CONFLICT_LABEL, buildSyncCommitMessage, isSyncCommitMessage, readBranchSyncState } from './sync-state';
import type { GitHubClient, PrInfo } from './github-client';
import { planLaneSync } from './sync-planner';

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
  /** undefined => no GitHub credentials/repo detected; PR operations are logged and skipped */
  github?: GitHubClient;
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
   * `HALT_SUMMARY_PREFIX` so the caller can aggregate failures and exit non-zero; it does not throw.
   */
  async syncLane(laneName: string, opts: { dryRun?: boolean } = {}): Promise<string> {
    const { cfg, defaultScope, logger } = this.deps;
    const branch = laneNameToBranch(laneName, cfg);
    const laneIdStr = `${defaultScope}/${laneName}`;

    await this.fetchOnce();

    const defaultBranch = await this.deps.ci.getDefaultBranchName();
    const remoteLane = await this.getRemoteLane(laneName);
    const laneHead = remoteLane ? laneHeadFingerprint(remoteLane.components) : undefined;
    const branchExists = await this.branchExistsOnRemote(branch);
    // No branch => no history to read (and `git log origin/<branch>` would throw). The planner
    // short-circuits on `!branchExists` before it looks at either field.
    const branchState = branchExists
      ? await readBranchSyncState(branch, defaultBranch)
      : { lastSyncedHead: undefined, syncCommitSha: undefined, hasDevCommits: false };
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

    if (opts.dryRun) {
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
    await git.raw(['checkout', '-B', branch, startPoint]);

    // Write the lane's files and `.bitmap` into the workspace. `workspaceOnly: false` is essential
    // here (the PR flow's default is `true`): we need EVERY component on the lane, including ones
    // this checkout of the branch doesn't have yet, otherwise the branch would silently mirror only
    // part of the lane.
    try {
      const switchErr = await this.deps.ci.switchToLaneForSync(laneIdStr, { workspaceOnly: false });
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
    await git.raw(['checkout', '-B', branch, `origin/${branch}`]);

    try {
      // `keepLane` reuses the existing remote lane so the lane's history and any Bit Cloud lane-based
      // edits survive across syncs (the temp-lane flow recreates the lane on every run, which would
      // churn the very lane we're mirroring). `skipCleanup` leaves the workspace on the lane so the
      // `.bitmap` written by the snap is what we commit onto the branch below — restoring to main
      // first would reset it to main's state and the branch would lose the lane pointer.
      await this.deps.ci.snapPrCommit({
        laneIdStr,
        message,
        build: undefined,
        strict: undefined,
        keepLane: true,
        skipCleanup: true,
      });

      // Re-query: the snap+export moved the lane, so the fingerprint we recorded before this
      // operation is stale. The trailer must name the state the branch now mirrors.
      const remoteLane = await this.getRemoteLane(laneName);
      if (!remoteLane) {
        return this.executeHalt({
          laneName,
          laneIdStr,
          branch,
          reason: `lane ${laneIdStr} could not be read back from the remote after export`,
          pr: await this.findPr(branch),
        });
      }
      const laneHead = laneHeadFingerprint(remoteLane.components);
      await this.commitAllAndPush(branch, buildSyncCommitMessage(laneIdStr, laneHead));
      return `${laneName} -> export-branch (lane ${laneIdStr} @ ${laneHead.slice(0, 9)}, branch ${branch} updated)`;
    } finally {
      await this.restoreWorkspace(defaultBranch);
    }
  }

  /**
   * Both sides moved since the last sync. Reconciling that needs a real `bit lane merge` plus a git
   * merge; it is implemented in the follow-up change that wires MergeLanesMain into CiMain.
   */
  private async executeMergeDiverged(ctx: {
    laneName: string;
    laneIdStr: string;
    branch: string;
    defaultBranch: string;
  }): Promise<string> {
    this.deps.logger.console(
      chalk.yellow(`Diverged lane/branch pair: ${ctx.laneIdStr} <-> ${ctx.branch} (on ${ctx.defaultBranch})`)
    );
    throw new Error('merge-diverged: implemented in the next change');
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
    const { logger, github } = this.deps;
    if (github && pr) {
      logger.console(chalk.blue(`Closing PR #${pr.number} for removed lane ${laneIdStr}`));
      await github.closePr(pr.number, `Lane ${laneIdStr} was removed/archived on bit.cloud.`);
    } else if (!github) {
      logger.console(chalk.yellow(`No GitHub client configured — skipping PR close for ${branch}`));
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
    const { logger, github } = this.deps;
    logger.console(chalk.red(`Cannot sync lane ${laneIdStr} automatically: ${reason}`));
    if (github && pr) {
      try {
        await github.addLabel(pr.number, CONFLICT_LABEL);
        await github.comment(pr.number, haltCommentBody({ reason, branch, laneId: laneIdStr }));
      } catch (e: any) {
        // The halt itself is the outcome that matters; failing to annotate the PR must not replace
        // the real reason with a GitHub API error.
        logger.consoleWarning(`Failed to annotate PR #${pr.number} with the sync conflict: ${e?.message || e}`);
      }
    } else if (!github) {
      logger.console(chalk.yellow(`No GitHub client configured — skipping conflict label/comment for ${branch}`));
    }
    return `${HALT_SUMMARY_PREFIX} ${laneName} -> ${reason}`;
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

  private async branchExistsOnRemote(branch: string): Promise<boolean> {
    const out = await git.raw(['ls-remote', '--heads', 'origin', branch]);
    return out.trim().length > 0;
  }

  /**
   * The open PR for the branch, if any. A GitHub API hiccup degrades to "no PR known" rather than
   * failing the lane: without the PR we lose the `bit-sync-conflict` check and PR bookkeeping, but
   * the git side of the sync is still correct and the next run re-reads the PR.
   */
  private async findPr(branch: string): Promise<PrInfo | undefined> {
    const { github, logger } = this.deps;
    if (!github) return undefined;
    try {
      return await github.findPrByBranch(branch);
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
    await this.ensureGitIdentity();
    await git.add(['-A', '.']);
    await git.commit(message, undefined, { '--allow-empty': null });
    await git.push('origin', branch);
    this.deps.logger.console(chalk.green(`Pushed ${branch}`));
  }

  /**
   * `git commit` fails outright when no identity is configured, which is the norm in a fresh CI
   * checkout. Only set one when the repo/environment doesn't already provide it, so an interactive
   * run keeps the developer's own identity.
   */
  private async ensureGitIdentity() {
    const configured = await git
      .raw(['config', '--get', 'user.email'])
      .then((out) => out.trim().length > 0)
      .catch(() => false);
    if (configured) return;
    await git.addConfig('user.email', 'bit-ci[bot]@bit.cloud');
    await git.addConfig('user.name', 'Bit CI');
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
    const { github, logger, defaultScope } = this.deps;
    if (!github) {
      logger.console(chalk.yellow(`No GitHub client configured — skipping PR creation for ${branch}`));
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
      const created = await github.createPr({
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
    } catch (e: any) {
      logger.consoleWarning(`Could not restore the workspace after sync: ${e?.message || e}`);
    }
  }
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

