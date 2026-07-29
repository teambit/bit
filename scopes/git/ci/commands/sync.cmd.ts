import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import type { CiMain } from '../ci.main.runtime';

type Options = { branch?: string; all?: boolean; main?: boolean; dryRun?: boolean };

export class CiSyncCmd implements Command {
  name = 'sync [lane]';
  description = 'Reconciles Bit lanes and the main scope with GitHub branches and pull requests.';
  extendedDescription = `Stateless reconciler: compares each mapped lane's remote head against the branch state recorded in git (Bit-Lane-Head commit trailer) and converges — importing lane changes onto the branch, exporting dev commits to the lane, or opening/closing PRs. The main scope is reconciled by checking the workspace out to its latest exported versions and proposing the result as a sync PR. Triggers (webhook, push, cron) only decide when it runs, never what it does. Safe to re-run at any time; converged state is a no-op. Configure mapping under "teambit.git/ci": { "sync": { ... } } in workspace.jsonc.`;
  group = 'collaborate';

  options: CommandOptions = [
    ['', 'branch <branch>', 'Resolve the lane from this git branch name using the sync mapping config'],
    ['', 'all', 'Reconcile every mapped lane plus the main scope (the default when no lane is given)'],
    ['', 'main', 'Reconcile only the main scope against the main branch (opens a sync PR on drift)'],
    ['', 'dry-run', 'Print the planned action per lane without writing anything to the remote'],
  ];

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private ci: CiMain
  ) {}

  // `[lane]: [string]` (rather than `[string?]`) follows the convention of every other command in the
  // repo with an optional positional argument — `CLIArgs` is `Array<string | string[]>`, so an
  // `undefined`-carrying tuple isn't assignable to it. The argument is genuinely optional at runtime,
  // hence the `|| undefined` below.
  async report([lane]: [string], options: Options) {
    this.logger.console('\n\n');
    this.logger.console('🔄 Initializing sync command');
    if (!this.workspace) throw new OutsideWorkspaceError();

    return this.ci.sync({
      lane: lane || undefined,
      branch: options.branch,
      all: options.all,
      main: options.main,
      dryRun: options.dryRun,
    });
  }
}
