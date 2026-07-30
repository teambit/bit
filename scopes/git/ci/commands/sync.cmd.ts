import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import type { CiMain } from '../ci.main.runtime';

type Options = { branch?: string; all?: boolean; main?: boolean; dryRun?: boolean; init?: boolean };

export class CiSyncCmd implements Command {
  name = 'sync [lane]';
  arguments = [
    {
      name: 'lane',
      description:
        'the lane to reconcile: either a lane name (hosted on the workspace\'s defaultScope) or a scope-qualified lane id, "other-org.other-scope/my-lane", for a lane hosted on another scope. Its components must still all live in this workspace\'s defaultScope',
    },
  ];
  description = 'Reconciles Bit lanes and the main scope with git branches and pull requests.';
  extendedDescription = `Stateless reconciler: compares each mapped lane's remote head against the state the branch itself records, and converges — importing lane changes onto the branch, exporting dev commits to the lane, or opening/closing PRs. That state comes from bit's own data: the .bitmap committed on the branch, which records the lane the branch mirrors and the exact version of every component on it. The "chore(bit-sync)" subject, "Bit-Lane-Head" trailer and "[bit-sync]" marker on sync commits are annotations for humans and triggers; the only decision that consults one is branch deletion, which additionally requires the marker to prove the reconciler wrote the branch tip. The main scope is reconciled by checking the workspace out to its latest exported versions and proposing the result as a sync PR. Triggers (webhook, push, cron) only decide when it runs, never what it does. Safe to re-run at any time; converged state is a no-op. A lane whose components are not all in this workspace's defaultScope is a cross-scope lane: no branch is created for it (it would leak another repository's components into this one) — enumerated runs skip it and stay green, an explicitly named one is refused, and a lane that became cross-scope after its branch existed is halted for a human. Configure mapping under \`"teambit.git/ci": { "sync": { ... } }\` in workspace.jsonc.`;
  group = 'collaborate';

  options: CommandOptions = [
    ['', 'branch <branch>', 'Resolve the lane from this git branch name using the sync mapping config'],
    [
      '',
      'all',
      'Reconcile every mapped lane plus the main scope (the default when no target is given; cannot be combined with a lane argument or --main)',
    ],
    [
      '',
      'main',
      'Reconcile only the main scope against the default branch, opening a sync PR on drift (conflicts resolve in favour of the scope)',
    ],
    [
      '',
      'dry-run',
      'Print the planned action per target. Nothing is pushed and no pull request is created or modified; the working tree is still written and then restored',
    ],
    [
      '',
      'init',
      'One-command onboarding: scaffold .github/workflows/bit-sync.yml + bit-release.yml (with this repository\'s actual default branch substituted), add the `"teambit.git/ci": { "sync": {} }` config block to workspace.jsonc if absent, and print the remaining manual-steps checklist (secrets + bit.cloud webhook). Writes nothing else and never overwrites an existing workflow file. Cannot be combined with a lane argument or any other flag.',
    ],
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
      init: options.init,
    });
  }
}
