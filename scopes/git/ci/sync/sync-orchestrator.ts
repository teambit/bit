import { formatTitle, formatWarningSummary } from '@teambit/cli';
import fs from 'fs';
import * as path from 'path';
import { BitError } from '@teambit/bit-error';
import { listScopesByOwner } from '@teambit/scope.remotes';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import type { LanesMain } from '@teambit/lanes';
import type { CheckoutMain } from '@teambit/checkout';
import { CiAspect } from '../ci.aspect';
import type { CiMain, CiWorkspaceConfig } from '../ci.main.runtime';
import { git } from '../git';
import type { CiSyncConfig, LaneTarget } from './sync-config';
import {
  isValidGitBranchName,
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
import { discoverLaneTargets, displayTarget, targetForBranch } from './lane-discovery';
import { readBranchLanePointer } from './sync-state';
import { chooseInitDefaultBranch, deriveOwnerRepo, renderInitReport, scaffoldWorkflowFiles } from './init-scaffold';
import { UNKNOWN_REPO, scaffoldAgentsMd } from './agents-md';

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
      workspace: this.deps.workspace,
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
      // A branch name carries no scope; its committed `.bitmap` lane pointer does, so a branch that
      // mirrors a foreign-hosted lane is reconciled against that lane, not a same-named `defaultScope` one.
      const target = await this.resolveBranchTarget(laneSync, branch, laneName, defaultScope);
      return this.summarizeSync([await laneSync.syncLane(target, { dryRun: opts.dryRun })]);
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
    const { targets, errors } = await this.listLanesToSync(cfg, mainLaneName, defaultBranch, laneSync);
    lines.push(...errors);
    this.deps.logger.console(
      formatTitle(
        `Reconciling ${targets.length} mapped lane(s) of ${defaultScope}` +
          `${targets.length ? `: ${targets.map((target) => displayTarget(target, defaultScope)).join(', ')}` : ''}`
      )
    );
    for (const target of targets) {
      // oxlint-disable-next-line no-await-in-loop
      lines.push(await laneSync.syncLane(target, { dryRun: opts.dryRun }));
    }
    lines.push(await mainSync.syncMain({ dryRun: opts.dryRun }));
    return this.summarizeSync(lines);
  }

  /**
   * `bit ci sync --init` — one-command onboarding: scaffolds the two workflow files, adds the sync
   * config block to workspace.jsonc if missing, puts the sync rules for coding agents into AGENTS.md,
   * and returns the report of the steps left. Safe to re-run: existing files are skipped, an existing
   * config block or AGENTS.md sync section is left alone; it never reconciles.
   */
  private async syncInit(): Promise<string> {
    const remoteUrl = await git.remote(['get-url', 'origin']).catch(() => undefined);
    const origin = typeof remoteUrl === 'string' ? remoteUrl.trim() : undefined;
    // The remote knows the default branch. When it can't answer (no origin, a repository not pushed
    // yet, a server out of reach), guess: the checked-out branch when it's main or master, else main.
    // A feature branch is never the guess: it would go into the workflows' branch filters.
    const detectedBranch = await this.deps.ci.detectDefaultBranchName();
    const defaultBranch = chooseInitDefaultBranch(detectedBranch, await this.currentBranchOr(''));

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

    // A workspace below the repository root: the actions must chdir into it (`ws-dir`).
    // Real paths: git reports the root with symlinks resolved (macOS `/tmp` is `/private/tmp`).
    const realPath = (p: string) => (fs.existsSync(p) ? fs.realpathSync(p) : p);
    const wsDir = path.relative(realPath(scaffoldRoot), realPath(this.deps.workspace.path)).split(path.sep).join('/');
    const fileOutcomes = scaffoldWorkflowFiles(
      scaffoldRoot,
      defaultBranch,
      wsDir && !wsDir.startsWith('..') ? wsDir : undefined
    );
    // Report the path relative to where the user is standing (`../../.github/...` from a nested
    // workspace), not to the workspace, so it is right to paste. Absolute only across drives.
    const displayPath = (abs: string) => {
      const fromCwd = path.relative(process.cwd(), abs);
      return fromCwd && !path.isAbsolute(fromCwd) ? fromCwd : abs;
    };
    const configAdded = await this.ensureSyncConfigBlock();
    // AGENTS.md belongs to the workspace, where agents run bit commands.
    const ownerRepo = deriveOwnerRepo(origin);
    const agentsOutcome = scaffoldAgentsMd(this.deps.workspace.path, {
      scope: this.deps.workspace.defaultScope ?? '<owner>.<scope>',
      repo: ownerRepo
        ? `${ownerRepo.host === 'github.com' ? '' : `${ownerRepo.host}/`}${ownerRepo.owner}/${ownerRepo.repo}`
        : UNKNOWN_REPO,
      defaultBranch,
    });
    // No commit yet: the first commit must take the whole workspace, not only the files --init wrote.
    const repoHasCommits = await git
      .raw(['rev-parse', '--verify', '--quiet', 'HEAD'])
      .then((out) => out.trim().length > 0)
      .catch(() => false);

    // What step 1 must stage: of the files --init handles, those git shows as new or changed. One that
    // .gitignore matches is listed apart, because `git add` refuses an ignored path named on the command line.
    const handled = [
      ...fileOutcomes.map((outcome) => path.join(scaffoldRoot, outcome.relativePath)),
      path.join(this.deps.workspace.path, 'workspace.jsonc'),
      path.join(this.deps.workspace.path, agentsOutcome.relativePath),
    ];
    const toStage: string[] = [];
    const ignored: string[] = [];
    if (repoRoot) {
      for (const abs of handled) {
        // Ignored first: `git status` hides an ignored file, so it would look unchanged. `check-ignore`
        // skips tracked files and prints the path only when it is ignored (it exits 1 otherwise). It
        // needs no commit, and the first commit's `git add -A` skips an ignored file too.
        // oxlint-disable-next-line no-await-in-loop
        const isIgnored = await git
          .raw(['check-ignore', '--', abs])
          .then((out) => out.trim().length > 0)
          .catch(() => false);
        if (isIgnored) {
          ignored.push(displayPath(abs));
          continue;
        }
        // the first commit stages everything with `git add -A`
        if (!repoHasCommits) continue;
        // oxlint-disable-next-line no-await-in-loop
        const changed = await git
          .raw(['status', '--porcelain', '--untracked-files=all', '--', abs])
          .then((out) => out.trim().length > 0)
          .catch(() => true);
        if (changed) toStage.push(displayPath(abs));
      }
    }

    // Returned, not logged: the command prints what `report()` returns.
    return renderInitReport({
      scopeId: this.deps.workspace.defaultScope,
      ownerRepo,
      originUrl: origin,
      defaultBranch,
      defaultBranchGuessed: !detectedBranch,
      // the workflows live at the repository root, which may be above the workspace
      repoRootFromCwd: path.relative(process.cwd(), scaffoldRoot) || '.',
      repoHasCommits,
      inGitRepo: Boolean(repoRoot),
      files: [
        ...fileOutcomes.map((outcome) => ({
          ...outcome,
          displayPath: displayPath(path.join(scaffoldRoot, outcome.relativePath)),
        })),
        { ...agentsOutcome, displayPath: displayPath(path.join(this.deps.workspace.path, agentsOutcome.relativePath)) },
      ],
      configDisplayPath: displayPath(path.join(this.deps.workspace.path, 'workspace.jsonc')),
      configAdded,
      ...(repoRoot ? { toStage, ignored } : {}),
    });
  }

  /** The checked-out branch when it is a usable name (not detached, not option-like), else `fallback`. */
  private async currentBranchOr(fallback: string): Promise<string> {
    const current = await git
      .raw(['branch', '--show-current'])
      .then((out) => out.trim())
      .catch(() => '');
    return current && isValidGitBranchName(current) ? current : fallback;
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
   * The lanes to reconcile on an `--all` run, plus one HALTED line per enumeration failure — see
   * `discoverLaneTargets`. This wires its I/O: the remote lane lists, bit.cloud's scope list for
   * wildcard `laneScopes`, and the branches of `origin` with their committed `.bitmap` lane pointers.
   */
  private async listLanesToSync(
    cfg: Required<CiSyncConfig>,
    mainLaneName: string,
    defaultBranch: string,
    laneSync: LaneSyncExecutor
  ): Promise<{ targets: LaneTarget[]; errors: string[] }> {
    if (!cfg.lanes.length) {
      this.deps.logger.console(
        formatWarningSummary('sync.lanes is empty — lane mirroring is disabled, reconciling the main scope only')
      );
      return { targets: [], errors: [] };
    }
    const defaultScope = this.deps.workspace.defaultScope;
    // The pointers are read off `origin/<branch>`; the lanes reuse this fetch. A failed fetch only
    // degrades resolution to `defaultScope` (the previous behavior) — the executor fetches, and
    // reports, again on its own.
    let fetched: Promise<boolean> | undefined;
    const ensureFetched = () => {
      fetched ??= laneSync
        .fetchOnce()
        .then(() => true)
        .catch((e: any) => {
          this.deps.logger.debug(`bit ci sync: fetching origin before enumeration failed: ${e?.message || e}`);
          return false;
        });
      return fetched;
    };
    return discoverLaneTargets(
      {
        listScopeLanes: (scope) => this.deps.lanes.getLanes({ remote: scope }),
        listOwnerScopes: listScopesByOwner,
        listBranches: listRemoteBranches,
        readBranchPointer: async (branch) =>
          (await ensureFetched()) ? readBranchLanePointer(branch, defaultScope).catch(() => undefined) : undefined,
        warn: (message) => this.deps.logger.console(formatWarningSummary(message)),
        debug: (message) => this.deps.logger.debug(message),
      },
      { cfg, defaultScope, defaultBranch, mainLaneName }
    );
  }

  /**
   * The lane `--branch <branch>` reconciles: the one its committed `.bitmap` points at when that pointer
   * names this lane, else the same-named lane on `defaultScope`. A failed fetch or read falls back to
   * `defaultScope` — the executor fetches (and reports) again on its own.
   */
  private async resolveBranchTarget(
    laneSync: LaneSyncExecutor,
    branch: string,
    laneName: string,
    defaultScope: string
  ): Promise<LaneTarget> {
    const pointer = await laneSync
      .fetchOnce()
      .then(() => readBranchLanePointer(branch, defaultScope))
      .catch(() => undefined);
    return targetForBranch(laneName, pointer, defaultScope);
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
