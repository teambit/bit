import { formatTitle, formatWarningSummary } from '@teambit/cli';
import * as path from 'path';
import { BitError } from '@teambit/bit-error';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import type { LanesMain } from '@teambit/lanes';
import type { CheckoutMain } from '@teambit/checkout';
import { CiAspect } from '../ci.aspect';
import type { CiMain, CiWorkspaceConfig } from '../ci.main.runtime';
import { git } from '../git';
import type { CiSyncConfig } from './sync-config';
import {
  branchToLaneName,
  laneNameToBranch,
  parseLaneTarget,
  resolveSyncConfig,
  shouldSyncLane,
  syncableLaneNameForBranch,
} from './sync-config';
import { HALT_SUMMARY_PREFIX, REFUSED_SUMMARY_PREFIX, LaneSyncExecutor } from './lane-sync-executor';
import { MainSyncExecutor } from './main-sync-executor';
import { selectGitHostProvider } from './git-host-provider';
import { gitRepoRoot, isNonContentPath, listRemoteBranches } from './git-ops';
import { deriveOwnerRepo, renderInitChecklist, scaffoldWorkflowFiles } from './init-scaffold';

/**
 * Refuse a `--dry-run` whose plan would be computed by force-checking-out branches over uncommitted
 * work: the main-scope drift is a diff, so the tree IS written before the dry-run return. A dry run
 * promises to write nothing, so it may not discard either — with a clean tree the write-then-restore
 * loses nothing.
 */
export function assertCleanForDryRun(dirtyFiles: string[]): void {
  if (!dirtyFiles.length) return;
  const named = `${dirtyFiles.slice(0, 10).join(', ')}${dirtyFiles.length > 10 ? ', …' : ''}`;
  throw new BitError(
    `bit ci sync --dry-run refuses to run: the working tree has ${dirtyFiles.length} uncommitted change(s), ` +
      `and computing the plan force-checkouts branches and removes untracked files, which would discard ` +
      `them. Commit or stash them first: ${named}`
  );
}

/** Everything the sync orchestration needs from `CiMain`, passed explicitly. */
export type SyncOrchestratorDeps = {
  ci: CiMain;
  workspace: Workspace;
  logger: Logger;
  lanes: LanesMain;
  checkout: CheckoutMain;
  config: CiWorkspaceConfig;
};

/**
 * Routing and aggregation for `bit ci sync`: decides which targets a run visits and how their
 * summaries combine. What reconciling a target means lives in the two executors, both stateless and
 * idempotent, so the trigger only ever decides when the reconciler runs.
 */
export class SyncOrchestrator {
  constructor(private deps: SyncOrchestratorDeps) {}

  /**
   * `bit ci sync` — reconcile Bit lanes and the main scope with git branches and pull requests.
   * Returns the per-target summary lines; throws the joined summary after the loop when any target
   * halted or was refused, so CI exits non-zero while every other target was still attempted. A skip
   * is neither — it reports itself and leaves the run green.
   */
  async sync(
    opts: { lane?: string; branch?: string; all?: boolean; main?: boolean; dryRun?: boolean; init?: boolean } = {}
  ): Promise<string> {
    if (opts.init) {
      if (opts.lane || opts.branch || opts.all || opts.main || opts.dryRun) {
        throw new BitError(
          'bit ci sync --init cannot be combined with a lane argument, --branch, --all, --main or ' +
            '--dry-run: it only scaffolds onboarding files (workflows + workspace.jsonc config) and exits ' +
            '— it never reconciles'
        );
      }
      return this.syncInit();
    }

    // Refuse contradictory flag combinations rather than silently letting one target win.
    const narrower = opts.lane
      ? `a lane argument ("${opts.lane}")`
      : (opts.branch && `--branch ("${opts.branch}")`) || (opts.main && '--main') || undefined;
    if (opts.all && narrower) {
      throw new BitError(
        `--all cannot be combined with ${narrower}: --all reconciles every mapped lane plus the main ` +
          `scope, and is what runs when no target is given`
      );
    }

    // A lane argument, `--branch` and `--main` each select the single target; any two contradict.
    const selectors = [
      opts.lane && `a lane argument ("${opts.lane}")`,
      opts.branch && `--branch ("${opts.branch}")`,
      opts.main && '--main',
    ].filter((selector): selector is string => Boolean(selector));
    if (selectors.length > 1) {
      const winner = opts.main ? '--main' : `--branch ("${opts.branch}")`;
      throw new BitError(
        `${selectors[0]} cannot be combined with ${selectors.slice(1).join(' or with ')}: each selects ` +
          `the single target this run reconciles, and only ${winner} would have run — the rest would be ` +
          `silently dropped, leaving a run that reports success while a target you named was never visited`
      );
    }

    const cfg = resolveSyncConfig(this.deps.config.sync);
    const defaultScope = this.deps.workspace.defaultScope;
    const defaultBranch = await this.deps.ci.getDefaultBranchName();
    const mainLaneName = this.deps.lanes.getDefaultLaneId().name;

    // The executors force-checkout branches and remove untracked files; warn up front, naming the
    // files at stake, before an interactive run discards anything.
    const statusAtStart = await git.status().catch(() => undefined);
    const dirtyFiles = (statusAtStart?.files ?? []).map((file) => file.path).filter((file) => !isNonContentPath(file));
    if (opts.dryRun) assertCleanForDryRun(dirtyFiles);
    if (dirtyFiles.length) {
      this.deps.logger.consoleWarning(
        `the working tree has ${dirtyFiles.length} uncommitted change(s). "bit ci sync" force-checkouts branches ` +
          `and removes untracked files (except .bit/ and node_modules/), so these will be discarded: ` +
          `${dirtyFiles.slice(0, 10).join(', ')}${dirtyFiles.length > 10 ? ', …' : ''}`
      );
    }

    const remoteUrl = await git.remote(['get-url', 'origin']).catch(() => undefined);
    const { provider: gitHost, reason: noGitHostReason } = selectGitHostProvider(
      this.deps.ci.listGitHostProviders(),
      typeof remoteUrl === 'string' ? remoteUrl.trim() : undefined
    );
    if (gitHost) this.deps.logger.debug(`bit ci sync: using the "${gitHost.name}" git host provider`);
    // Warn once, up front — the executors' per-action lines can only say PRs were skipped, not why.
    else if (noGitHostReason) this.deps.logger.consoleWarning(noGitHostReason);

    const laneSync = new LaneSyncExecutor({
      lanes: this.deps.lanes,
      ci: this.deps.ci,
      logger: this.deps.logger,
      gitHost,
      cfg,
      defaultScope,
    });
    const mainSync = new MainSyncExecutor({
      checkout: this.deps.checkout,
      lanes: this.deps.lanes,
      ci: this.deps.ci,
      logger: this.deps.logger,
      gitHost,
      cfg,
      defaultBranch,
      defaultScope,
    });

    if (opts.main) {
      return this.summarizeSync([await mainSync.syncMain({ dryRun: opts.dryRun })]);
    }

    if (opts.branch) {
      const branch = opts.branch;
      // Under the default `branchPrefix: ''` these two would resolve to the bogus lanes "main" /
      // "bit-sync/main"; both are reconciled by the main-scope path, never as lanes.
      if (branch === defaultBranch) {
        return `branch ${branch} is the default branch — reconcile it with "bit ci sync --main"; nothing to do`;
      }
      if (branch === cfg.mainSyncBranch) {
        return `branch ${branch} is the main sync branch maintained by this command; nothing to do`;
      }
      const laneName = syncableLaneNameForBranch(branch, cfg);
      if (!laneName) return `branch ${branch} does not map to a valid lane name; nothing to do`;
      const skipReason = this.laneNotSyncableReason(laneName, cfg, mainLaneName, defaultBranch);
      if (skipReason) return `${skipReason} (branch ${branch})`;
      // A branch name carries no scope, so this path can only resolve the lane against `defaultScope`;
      // resolving a foreign-hosted lane to the wrong scope is safe (no-op, never a deletion).
      return this.summarizeSync([
        await laneSync.syncLane({ hostScope: defaultScope, name: laneName }, { dryRun: opts.dryRun }),
      ]);
    }

    if (opts.lane) {
      // Every guard below is asked about the NAME: "main" is not a lane whichever scope hosts it, and
      // the `lanes` patterns match lane names, not lane ids.
      const target = parseLaneTarget(opts.lane, defaultScope);
      const skipReason = this.laneNotSyncableReason(target.name, cfg, mainLaneName, defaultBranch);
      if (skipReason) return skipReason;
      return this.summarizeSync([await laneSync.syncLane(target, { dryRun: opts.dryRun, explicitTarget: true })]);
    }

    // `--all` (also the no-arguments default): every mapped lane, then the main scope. Sequential on
    // purpose — the lanes share one workspace and one git checkout.
    const lines: string[] = [];
    const { lanes: lanesToSync, errors } = await this.listLanesToSync(cfg, mainLaneName, defaultBranch);
    lines.push(...errors);
    this.deps.logger.console(
      formatTitle(
        `Reconciling ${lanesToSync.length} mapped lane(s) of ${defaultScope}` +
          `${lanesToSync.length ? `: ${lanesToSync.join(', ')}` : ''}`
      )
    );
    for (const laneName of lanesToSync) {
      // Every enumerated target is hosted on `defaultScope` by construction; foreign-hosted lanes are
      // explicit-target only.
      // oxlint-disable-next-line no-await-in-loop
      lines.push(await laneSync.syncLane({ hostScope: defaultScope, name: laneName }, { dryRun: opts.dryRun }));
    }
    lines.push(await mainSync.syncMain({ dryRun: opts.dryRun }));
    return this.summarizeSync(lines);
  }

  /**
   * `bit ci sync --init` — one-command onboarding: scaffolds the two workflow files, adds the sync
   * config block to workspace.jsonc if missing, and prints the manual-steps checklist. Safe to
   * re-run: existing files are skipped, an existing config block is left alone; it never reconciles.
   */
  private async syncInit(): Promise<string> {
    const defaultBranch = await this.deps.ci.getDefaultBranchName();

    // Workflows belong to the repository, not the workspace: GitHub only discovers them at
    // `<repo-root>/.github/workflows`, and a bit workspace may be a subdirectory.
    const repoRoot = await gitRepoRoot();
    const scaffoldRoot = repoRoot ?? this.deps.workspace.path;
    if (!repoRoot) {
      this.deps.logger.consoleWarning(
        `could not resolve the git repository root ("git rev-parse --show-toplevel" failed — is this a git ` +
          `repository?). Writing the workflow files under the workspace instead: ${scaffoldRoot}. If that is ` +
          `not the repository root, GitHub will not discover them — move .github/workflows there by hand.`
      );
    }

    const fileOutcomes = scaffoldWorkflowFiles(scaffoldRoot, defaultBranch);
    // Report the path relative to where the user is standing, not to the workspace.
    const displayPath = (relativePath: string) => {
      const abs = path.join(scaffoldRoot, relativePath);
      const fromCwd = path.relative(process.cwd(), abs);
      return fromCwd && !fromCwd.startsWith('..') ? fromCwd : abs;
    };
    const fileLines = fileOutcomes.map((outcome) =>
      outcome.status === 'written'
        ? `wrote ${displayPath(outcome.relativePath)} (default branch: ${defaultBranch})`
        : `skipped ${displayPath(outcome.relativePath)} (already exists — bit ci sync --init never overwrites)`
    );

    const configAdded = await this.ensureSyncConfigBlock();
    const configLine = configAdded
      ? 'added "teambit.git/ci": { "sync": {} } to workspace.jsonc'
      : 'workspace.jsonc already configures "teambit.git/ci".sync — left untouched';

    const remoteUrl = await git.remote(['get-url', 'origin']).catch(() => undefined);
    const ownerRepo = deriveOwnerRepo(typeof remoteUrl === 'string' ? remoteUrl.trim() : undefined);

    const summary = ['bit ci sync --init', ...fileLines, configLine, renderInitChecklist(ownerRepo)].join('\n');
    this.deps.logger.console(summary);
    return summary;
  }

  /**
   * Add `"sync": {}` under `"teambit.git/ci"` in workspace.jsonc if that key isn't there yet; returns
   * whether it wrote. The comment-preserving `WorkspaceConfig` API merges into existing
   * `teambit.git/ci` config rather than clobbering it.
   */
  private async ensureSyncConfigBlock(): Promise<boolean> {
    const wsConfig = this.deps.workspace.getWorkspaceConfig();
    const existing = wsConfig.extension(CiAspect.id, true) as CiWorkspaceConfig | undefined;
    if (existing?.sync) return false;
    wsConfig.setExtension(CiAspect.id, { sync: {} }, { mergeIntoExisting: true, ignoreVersion: true });
    await wsConfig.write({ reasonForChange: 'bit ci sync --init: add the sync config block' });
    return true;
  }

  /**
   * Why this lane name must not be handed to the lane executor, or undefined when it's syncable. The
   * mapped branch is checked too — the lane path must never write the two branches the main-scope
   * path owns.
   */
  private laneNotSyncableReason(
    laneName: string,
    cfg: Required<CiSyncConfig>,
    mainLaneName: string,
    defaultBranch: string
  ): string | undefined {
    if (laneName === mainLaneName) {
      return `"${mainLaneName}" is not a lane — reconcile the main scope with "bit ci sync --main"; nothing to do`;
    }
    const branch = laneNameToBranch(laneName, cfg);
    if (branch === defaultBranch) {
      return (
        `lane ${laneName} maps to the default branch ${branch} — reconcile it with "bit ci sync --main"; ` +
        `nothing to do`
      );
    }
    if (branch === cfg.mainSyncBranch) {
      return `lane ${laneName} maps to ${branch}, the main sync branch maintained by this command; nothing to do`;
    }
    if (!shouldSyncLane(laneName, cfg)) {
      return `lane ${laneName} is not matched by the sync config (lanes: ${JSON.stringify(cfg.lanes)}); nothing to do`;
    }
    return undefined;
  }

  /**
   * The lane names to reconcile on an `--all` run (sorted), plus one HALTED line per enumeration
   * failure. The list is the union of the remote's lanes AND the lane-mapped branches on `origin` —
   * a lane deleted on bit.cloud is gone from the first source, and only the branch side can make
   * `close-pr` fire for it. An enumeration failure is reported rather than thrown, so the half that
   * did enumerate is still reconciled while the run exits non-zero.
   */
  private async listLanesToSync(
    cfg: Required<CiSyncConfig>,
    mainLaneName: string,
    defaultBranch: string
  ): Promise<{ lanes: string[]; errors: string[] }> {
    if (!cfg.lanes.length) {
      this.deps.logger.console(
        formatWarningSummary('sync.lanes is empty — lane mirroring is disabled, reconciling the main scope only')
      );
      return { lanes: [], errors: [] };
    }
    const errors: string[] = [];
    const names = new Set<string>();
    const remote = this.deps.workspace.defaultScope;

    try {
      const lanes = await this.deps.lanes.getLanes({ remote });
      lanes.forEach((lane) => {
        const name = lane.id?.name ?? lane.name;
        if (name) names.add(name);
      });
    } catch (e: any) {
      const msg = e?.toString() ?? '';
      // A scope with no lanes at all: the remote answers "not found" rather than an empty list.
      if (msg.includes('was not found') || msg.includes('not found')) {
        this.deps.logger.console(
          formatWarningSummary(`No lanes found on ${remote} — reconciling lane-mapped branches and the main scope only`)
        );
      } else {
        errors.push(`${HALT_SUMMARY_PREFIX} lanes -> could not list the lanes of ${remote}: ${msg}`);
      }
    }

    try {
      for (const branch of await listRemoteBranches()) {
        // Reconciled by the main-scope path, never as lanes — under the default `branchPrefix: ''`
        // they would otherwise resolve to the bogus lanes "main" / "bit-sync/main".
        if (branch === defaultBranch || branch === cfg.mainSyncBranch) continue;
        // Ordinary developer branches are skipped at debug level, never as a summary line.
        const laneName = syncableLaneNameForBranch(branch, cfg);
        if (!laneName) {
          this.deps.logger.debug(
            `bit ci sync: branch "${branch}" does not map to a name any lane could have ` +
              `(mapped to "${branchToLaneName(branch, cfg) ?? '<not lane-mapped>'}") — skipping it`
          );
          continue;
        }
        names.add(laneName);
      }
    } catch (e: any) {
      errors.push(
        `${HALT_SUMMARY_PREFIX} lanes -> could not list the branches of "origin", so a lane deleted on ` +
          `bit.cloud may have kept an orphan branch and an open PR: ${e?.message || e}`
      );
    }

    const lanes = [...names]
      .filter((name) => name !== mainLaneName)
      .filter((name) => shouldSyncLane(name, cfg))
      .sort();
    return { lanes, errors };
  }

  /**
   * Join the per-target summary lines, and turn any halt into a non-zero exit — the executors never
   * throw, so this is the single place "needs a human" becomes visible to CI. `BitError` rather than
   * `Error`: bit reports a plain `Error` as an internal failure (stack trace, Sentry FATAL).
   */
  private summarizeSync(lines: string[]): string {
    const summary = lines.join('\n');
    const halted = lines.filter((line) => line.startsWith(HALT_SUMMARY_PREFIX));
    if (halted.length) {
      throw new BitError(`bit ci sync could not reconcile ${halted.length} target(s):\n${summary}`);
    }
    // A refusal is not a halt: the repository is healthy, the reconciler simply will not do what was
    // asked — exit non-zero saying that, rather than reporting a sync conflict.
    const refusals = lines.filter((line) => line.startsWith(REFUSED_SUMMARY_PREFIX));
    if (refusals.length) {
      throw new BitError(refusals.map((line) => line.slice(REFUSED_SUMMARY_PREFIX.length).trim()).join('\n'));
    }
    return summary;
  }
}
