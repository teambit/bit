import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import type { LanesMain } from '@teambit/lanes';
import type { CheckoutMain } from '@teambit/checkout';
import { CiAspect } from '../ci.aspect';
import type { CiMain, CiWorkspaceConfig } from '../ci.main.runtime';
import { git } from '../git';
import type { CiSyncConfig } from './sync-config';
import { branchToLaneName, laneNameToBranch, parseLaneTarget, resolveSyncConfig, shouldSyncLane } from './sync-config';
import { HALT_SUMMARY_PREFIX, REFUSED_SUMMARY_PREFIX, LaneSyncExecutor } from './lane-sync-executor';
import { MainSyncExecutor } from './main-sync-executor';
import { selectGitHostProvider } from './git-host-provider';
import { isNonContentPath, listRemoteBranches } from './git-ops';
import { deriveOwnerRepo, renderInitChecklist, scaffoldWorkflowFiles } from './init-scaffold';

/**
 * Everything the sync orchestration needs from `CiMain`, passed explicitly rather than reached through
 * `this`. `ci` is the aspect itself, which the two executors need (they call back into it for
 * `snapPrCommit`, `switchToLaneForSync`, `reloadWorkspaceFromDisk` and the default-branch lookup) — the
 * rest are the collaborators the orchestration reads directly.
 */
export type SyncOrchestratorDeps = {
  ci: CiMain;
  workspace: Workspace;
  logger: Logger;
  lanes: LanesMain;
  checkout: CheckoutMain;
  config: CiWorkspaceConfig;
};

/**
 * Routing and aggregation for `bit ci sync`, lifted out of `CiMain` so the aspect's runtime file stays
 * readable (and under the repo's max-lines rule).
 *
 * This layer decides *which* targets a run visits and how their summaries combine; it decides nothing
 * about what reconciling a target means. Every such decision lives in the two executors
 * (`LaneSyncExecutor` per lane, `MainSyncExecutor` for the main scope), both of which are stateless and
 * idempotent, so the trigger that invoked the command only ever decides *when* the reconciler runs.
 *
 * `CiMain.sync()` delegates here and is otherwise unchanged: the aspect's public API and provider
 * signature are exactly what they were.
 */
export class SyncOrchestrator {
  constructor(private deps: SyncOrchestratorDeps) {}

  /**
   * `bit ci sync` — reconcile Bit lanes and the main scope with git branches and pull requests.
   *
   * This is only routing and aggregation: every decision about *what* to do lives in the two
   * executors (`LaneSyncExecutor` per lane, `MainSyncExecutor` for the main scope), and every
   * executor is stateless and idempotent. The trigger that invoked the command therefore only decides
   * *when* the reconciler runs, never what it does.
   *
   * Returns the collected per-target summary lines. If any target halted (its line starts with
   * `HALT_SUMMARY_PREFIX`) or was refused (`REFUSED_SUMMARY_PREFIX`) the method **throws** the joined
   * summary after the loop, so a CI run exits non-zero — while still having attempted, and reported on,
   * every other target. Note that a *skip* is neither: a target this repository legitimately has nothing
   * to do for (a cross-scope lane met by `--all`) reports itself and leaves the run green.
   */
  async sync(
    opts: { lane?: string; branch?: string; all?: boolean; main?: boolean; dryRun?: boolean; init?: boolean } = {}
  ): Promise<string> {
    // `--init` is a one-shot onboarding scaffold, not a reconcile: it writes files and exits. Combining
    // it with any other flag (a lane, --branch, --all, --main, --dry-run) is always a mistake about what
    // will run, so refuse rather than silently ignoring the other flag or silently skipping the scaffold.
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

    // `--all` is the default, so combining it with a narrower target is always a mistake about what the
    // command will do. Refuse instead of silently letting the narrower target win.
    if (opts.all && (opts.lane || opts.main)) {
      throw new BitError(
        `--all cannot be combined with ${opts.lane ? `a lane argument ("${opts.lane}")` : '--main'}: ` +
          `--all reconciles every mapped lane plus the main scope, and is what runs when no target is given`
      );
    }

    const cfg = resolveSyncConfig(this.deps.config.sync);
    const defaultScope = this.deps.workspace.defaultScope;
    const defaultBranch = await this.deps.ci.getDefaultBranchName();
    const mainLaneName = this.deps.lanes.getDefaultLaneId().name;

    if (cfg.mode !== 'git-source-of-truth') {
      // `mode` is accepted and resolved but nothing reads it yet — every path behaves as
      // 'git-source-of-truth'. Say so rather than letting a configured 'mirror' look effective.
      this.deps.logger.consoleWarning(
        `sync.mode is set to "${cfg.mode}", but mode is not implemented yet — this run behaves as ` +
          `"git-source-of-truth" (git wins on conflict, merges happen on the git host)`
      );
    }

    // Both executors force-checkout branches and remove untracked files, so anything uncommitted in
    // this workspace is discarded. That is the right behaviour in a CI clone (its tree is pristine by
    // definition) and destructive when someone runs the command interactively — so say it out loud
    // before doing any of it, naming the files at stake.
    const statusAtStart = await git.status().catch(() => undefined);
    // `.bit/` and `node_modules/` are filtered out because the executors never touch them — and in a
    // workspace whose `.gitignore` lacks Bit's block, `git status` lists every file under them,
    // which would make this warning claim tens of thousands of files are about to be discarded.
    const dirtyFiles = (statusAtStart?.files ?? []).map((file) => file.path).filter((path) => !isNonContentPath(path));
    if (dirtyFiles.length) {
      this.deps.logger.consoleWarning(
        `the working tree has ${dirtyFiles.length} uncommitted change(s). "bit ci sync" force-checkouts branches ` +
          `and removes untracked files (except .bit/ and node_modules/), so these will be discarded: ` +
          `${dirtyFiles.slice(0, 10).join(', ')}${dirtyFiles.length > 10 ? ', …' : ''}`
      );
    }

    // Which git host serves this repository is a *registration* question, not a hard-coded one: the
    // engine only knows the `GitHostProvider` contract, and picks among the providers registered into
    // the slot (GitHub among them) by the `origin` remote. An unreadable remote or a host nobody
    // claims and no credentials is not fatal — it degrades to "no git host", which each executor
    // reports and works around (git-only sync).
    const remoteUrl = await git.remote(['get-url', 'origin']).catch(() => undefined);
    const { provider: gitHost, reason: noGitHostReason } = selectGitHostProvider(
      this.deps.ci.listGitHostProviders(),
      typeof remoteUrl === 'string' ? remoteUrl.trim() : undefined
    );
    if (gitHost) this.deps.logger.debug(`bit ci sync: using the "${gitHost.name}" git host provider`);
    // Warn once, up front, with the specific reason — the executors' per-action lines can only say
    // that PR operations were skipped, not why. This is where "the github provider claims origin but
    // has no token" becomes visible instead of looking like a deliberately git-only run.
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
      // With the default config (`branchPrefix: ''`) every branch name maps to a same-named lane, so
      // these two would otherwise resolve to the lanes "main" / "bit-sync/main" and sync nonsense.
      // Both branches are reconciled by the main-scope path, not as lanes.
      if (branch === defaultBranch) {
        return `branch ${branch} is the default branch — reconcile it with "bit ci sync --main"; nothing to do`;
      }
      if (branch === cfg.mainSyncBranch) {
        return `branch ${branch} is the main sync branch maintained by this command; nothing to do`;
      }
      const laneName = branchToLaneName(branch, cfg);
      if (!laneName) return `branch ${branch} is not lane-mapped; nothing to do`;
      const skipReason = this.laneNotSyncableReason(laneName, cfg, mainLaneName, defaultBranch);
      if (skipReason) return `${skipReason} (branch ${branch})`;
      // A branch name carries no scope, so this path can only resolve the lane against `defaultScope`.
      // A foreign-hosted lane is addressable by its scope-qualified id only (Stage 0) — see
      // `assessBranchOwnership` for why resolving it here to the wrong scope is safe (no-op, never a
      // deletion) rather than merely unhelpful.
      return this.summarizeSync([
        await laneSync.syncLane({ hostScope: defaultScope, name: laneName }, { dryRun: opts.dryRun }),
      ]);
    }

    if (opts.lane) {
      // `[lane]` accepts both `my-lane` (hosted on defaultScope) and `other-scope/my-lane`. Every guard
      // below is asked about the NAME: "main" is not a lane whichever scope hosts it, and the `lanes`
      // patterns match lane names, not lane ids.
      const target = parseLaneTarget(opts.lane, defaultScope);
      const skipReason = this.laneNotSyncableReason(target.name, cfg, mainLaneName, defaultBranch);
      if (skipReason) return skipReason;
      return this.summarizeSync([await laneSync.syncLane(target, { dryRun: opts.dryRun, explicitTarget: true })]);
    }

    // `--all`, which is also the no-arguments default: every mapped lane, then the main scope. The
    // lanes are synced sequentially on purpose — they share one workspace and one git checkout.
    const lines: string[] = [];
    const { lanes: lanesToSync, errors } = await this.listLanesToSync(cfg, mainLaneName, defaultBranch);
    lines.push(...errors);
    this.deps.logger.console(
      chalk.blue(
        `Reconciling ${lanesToSync.length} mapped lane(s) of ${defaultScope}` +
          `${lanesToSync.length ? `: ${lanesToSync.join(', ')}` : ''}`
      )
    );
    for (const laneName of lanesToSync) {
      // `--all` enumerates this scope's own lanes and this repo's lane-mapped branches, so every target
      // here is hosted on `defaultScope` by construction. Foreign-hosted lanes are explicit-target only
      // in Stage 0; enumerating them needs the `laneSources` config designed for Stage 1.
      // eslint-disable-next-line no-await-in-loop
      lines.push(await laneSync.syncLane({ hostScope: defaultScope, name: laneName }, { dryRun: opts.dryRun }));
    }
    lines.push(await mainSync.syncMain({ dryRun: opts.dryRun }));
    return this.summarizeSync(lines);
  }

  /**
   * `bit ci sync --init` — one-command onboarding. Scaffolds `.github/workflows/bit-sync.yml` and
   * `bit-release.yml` (with this repository's actual default branch substituted), adds the
   * `"teambit.git/ci": { "sync": {} }` config block to `workspace.jsonc` if it's not there yet, and
   * prints the checklist of steps that still need a human (secrets, the bit.cloud webhook, and the
   * `fetch-depth: 0` requirement — none of which this command can do on its own).
   *
   * Never throws on an "already there" outcome: an existing workflow file is skipped (not
   * overwritten — this must be safe to re-run) and an existing `sync` config block is left alone. It
   * only writes; it never reconciles.
   */
  private async syncInit(): Promise<string> {
    const defaultBranch = await this.deps.ci.getDefaultBranchName();
    const fileOutcomes = scaffoldWorkflowFiles(this.deps.workspace.path, defaultBranch);
    const fileLines = fileOutcomes.map((outcome) =>
      outcome.status === 'written'
        ? `wrote ${outcome.relativePath} (default branch: ${defaultBranch})`
        : `skipped ${outcome.relativePath} (already exists — bit ci sync --init never overwrites)`
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
   * Add `"sync": {}` under `"teambit.git/ci"` in `workspace.jsonc` if that key isn't there yet.
   * Returns whether it actually wrote anything.
   *
   * Uses the same comment-preserving `WorkspaceConfig` API `scope-trust.ts` uses for its own
   * workspace.jsonc patches (`getWorkspaceConfig().setExtension(..., { mergeIntoExisting: true,
   * ignoreVersion: true })` then `.write()`), rather than printing the block for the user to paste:
   * it merges into whatever `teambit.git/ci` config already exists (e.g. `commitMessageScript`)
   * instead of clobbering it, and preserves comments elsewhere in the file. `mergeIntoExisting` also
   * makes this safe to call when the extension key doesn't exist at all yet — `setExtension` just sets
   * it fresh in that case.
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
   * Why this lane name must not be handed to the lane executor, or undefined when it's syncable.
   *
   * The reserved names are checked against the lane **name** (never a scope-qualified id): "main" is not
   * a lane whichever scope hosts it, and the `lanes` patterns match names. The branch a name maps to is
   * checked too — reconciling a "lane" onto the default branch or onto the main sync branch would let the
   * lane path write the two branches the main-scope path owns.
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
   * The lane names to reconcile on an `--all` run, sorted for a deterministic run order, plus one
   * HALTED summary line per enumeration failure.
   *
   * The list is the **union of two sources**, and the second half is not redundant:
   *
   * - **the lanes on the default scope's remote** — the lanes that still exist, and may need mirroring
   *   onto a branch;
   * - **the lane-mapped branches on `origin`** — a lane that was merged, archived or deleted on
   *   bit.cloud is *gone* from the first list, so enumerating lanes alone can never visit its branch and
   *   the whole `close-pr` action (close the PR, delete the branch) would never fire for the one state
   *   that needs it. A branch-only entry resolves `laneHead === undefined` in `syncLane`, which is
   *   exactly the input `planLaneSync` turns into `close-pr`.
   *
   * Both halves are filtered by the same rules (never the main lane, must match `sync.lanes`) and
   * deduplicated by lane name, so a lane that exists on both sides is reconciled once.
   *
   * A failure to enumerate either source is reported as a HALTED line rather than thrown, so the half
   * that *did* enumerate is still reconciled and the run still exits non-zero. Silently syncing a subset
   * would look like a successful run while lanes (or orphaned branches) went untouched. A remote that
   * reports it has no lanes at all is not a failure.
   */
  private async listLanesToSync(
    cfg: Required<CiSyncConfig>,
    mainLaneName: string,
    defaultBranch: string
  ): Promise<{ lanes: string[]; errors: string[] }> {
    if (!cfg.lanes.length) {
      this.deps.logger.console(
        chalk.yellow('sync.lanes is empty — lane mirroring is disabled, reconciling the main scope only')
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
          chalk.yellow(`No lanes found on ${remote} — reconciling lane-mapped branches and the main scope only`)
        );
      } else {
        errors.push(`${HALT_SUMMARY_PREFIX} lanes -> could not list the lanes of ${remote}: ${msg}`);
      }
    }

    try {
      for (const branch of await listRemoteBranches()) {
        // Both of these are reconciled by the main-scope path, never as lanes. The exclusion is
        // load-bearing under the default `branchPrefix: ''`, where every branch name maps to a
        // same-named lane: without it they would resolve to the bogus lanes "main" / "bit-sync/main".
        if (branch === defaultBranch || branch === cfg.mainSyncBranch) continue;
        const laneName = branchToLaneName(branch, cfg);
        if (laneName) names.add(laneName);
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
   * Join the per-target summary lines, and turn any halt into a non-zero exit. Throwing is
   * deliberate: the executors never throw (one unreconcilable target must not abort the targets after
   * it), so this is the single place where "something needs a human" becomes visible to CI.
   *
   * `BitError` rather than `Error`: a halt is a *user-actionable* outcome (resolve a conflict, remove a
   * label, unstick a lane), and bit's error handler reports a plain `Error` as an internal failure —
   * printing a stack trace and shipping it to Sentry as FATAL. The message is the whole payload here.
   */
  private summarizeSync(lines: string[]): string {
    const summary = lines.join('\n');
    const halted = lines.filter((line) => line.startsWith(HALT_SUMMARY_PREFIX));
    if (halted.length) {
      throw new BitError(`bit ci sync could not reconcile ${halted.length} target(s):\n${summary}`);
    }
    // A refusal is not a halt: nothing is mid-flight, no PR was labelled, and the repository is healthy —
    // the reconciler simply will not do the specific thing that was asked for. So it exits non-zero (the
    // request was not carried out) while saying exactly that, rather than reporting a sync conflict. Only
    // an explicitly targeted single lane can produce one, so there is never a mix of both.
    const refusals = lines.filter((line) => line.startsWith(REFUSED_SUMMARY_PREFIX));
    if (refusals.length) {
      throw new BitError(refusals.map((line) => line.slice(REFUSED_SUMMARY_PREFIX.length).trim()).join('\n'));
    }
    return summary;
  }
}
