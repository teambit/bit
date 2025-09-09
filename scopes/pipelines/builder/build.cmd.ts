import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import prettyTime from 'pretty-time';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError } from '@teambit/workspace';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import chalk from 'chalk';
import type { BuilderMain } from './builder.main.runtime';
import { IssuesClasses } from '@teambit/component-issues';

type BuildOpts = {
  unmodified?: boolean;
  dev: boolean;
  rebuild: boolean;
  install: boolean;
  cachePackagesOnCapsulesRoot: boolean;
  reuseCapsules: boolean;
  rewrite?: boolean; //relevant only when reuseCapsules is set
  reinstall?: boolean; //relevant only when reuseCapsules is set
  tasks: string;
  listTasks?: string;
  skipTests?: boolean;
  skipTasks?: string;
  failFast?: boolean;
  includeSnap?: boolean;
  includeTag?: boolean;
  ignoreIssues?: string;
  loose?: boolean;
};

export class BuilderCmd implements Command {
  name = 'build [component-pattern]';
  description = 'run build pipeline tasks in isolated environments';
  extendedDescription = `executes the complete build pipeline including compilation, testing, linting, and other tasks defined by component environments.
the build takes place in isolated directories called "capsules" where component files are copied and dependencies are installed via the package manager.
by default processes only new and modified components - use --unmodified to build all components.
because this process can take a while on large workspaces, various flags are available to optimize the process - see examples for debugging workflows.`;
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  examples = [
    {
      cmd: 'build --reuse-capsules --tasks "custom-task"',
      description: 'helps to debug this "custom-task" without recreating the capsules from scratch',
    },
    {
      cmd: 'build --reuse-capsules --rewrite --tasks "BabelCompile,MochaTest"',
      description: `helpful when for example the tests are failing and code changes are needed to debug it.
the "--rewrite" flag ensures the component files are fresh, and the "--tasks" ensures to re-compile them and then run the tests`,
    },
  ];
  helpUrl = 'reference/build-pipeline/builder-overview';
  alias = '';
  group = 'component-development';
  options = [
    ['u', 'unmodified', 'include unmodified components (by default, only new and modified components are built)'],
    ['d', 'dev', 'run the pipeline in dev mode'],
    ['', 'install', 'install core aspects in capsules'],
    ['', 'reuse-capsules', 'avoid deleting the capsules root-dir before starting the build'],
    ['', 'rewrite', 'use only with --reuse-capsules. rewrite the component files'],
    ['', 'reinstall', 'use only with --reuse-capsules. rerun the installation'],
    [
      '',
      'tasks <string>',
      `build the specified task(s) only. for multiple tasks, separate by a comma and wrap with quotes.
specify the task-name (e.g. "TypescriptCompiler") or the task-aspect-id (e.g. teambit.compilation/compiler)`,
    ],
    ['', 'cache-packages-on-capsule-root', 'set the package-manager cache on the capsule root'],
    [
      '',
      'list-tasks <string>',
      'list tasks of an env or a component-id for each one of the pipelines: build, tag and snap',
    ],
    ['', 'skip-tests', 'skip running component tests during build process'],
    ['', 'loose', 'allow build to succeed even if tasks like tests or lint fail'],
    [
      '',
      'skip-tasks <string>',
      `skip the given tasks. for multiple tasks, separate by a comma and wrap with quotes.
  specify the task-name (e.g. "TypescriptCompiler") or the task-aspect-id (e.g. teambit.compilation/compiler)`,
    ],
    [
      '',
      'fail-fast',
      'stop pipeline execution on the first failed task (by default a task is skipped only when its dependency failed)',
    ],
    ['', 'include-snap', 'include snap pipeline tasks. Warning: this may deploy/publish if you have such tasks'],
    ['', 'include-tag', 'include tag pipeline tasks. Warning: this may deploy/publish if you have such tasks'],
    [
      'i',
      'ignore-issues <issues>',
      `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
    ],
  ] as CommandOptions;

  constructor(
    private builder: BuilderMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  async report(
    [pattern]: [string],
    {
      unmodified = false,
      dev = false,
      install = false,
      cachePackagesOnCapsulesRoot = false,
      reuseCapsules = false,
      rewrite = false,
      reinstall = false,
      tasks,
      listTasks,
      skipTests,
      skipTasks,
      failFast,
      includeSnap,
      includeTag,
      ignoreIssues,
      loose = false,
    }: BuildOpts
  ): Promise<string> {
    if (rewrite && !reuseCapsules) throw new Error('cannot use --rewrite without --reuse-capsules');
    if (reinstall && !reuseCapsules) throw new Error('cannot use --reinstall without --reuse-capsules');
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (listTasks) {
      return this.getListTasks(listTasks);
    }

    this.logger.setStatusLine('build');
    const start = process.hrtime();
    // If pattern is provided, don't pass the unmodified flag as "all" - the pattern should take precedence
    const components = await this.workspace.getComponentsByUserInput(pattern ? false : unmodified, pattern, true);
    if (!components.length) {
      return chalk.bold(
        `no components found to build. use "--unmodified" flag to build all components or specify the ids to build, otherwise, only new and modified components will be built`
      );
    }

    const skipTasksParsed = skipTasks ? skipTasks.split(',').map((t) => t.trim()) : undefined;

    const envsExecutionResults = await this.builder.build(
      components,
      {
        installOptions: {
          installTeambitBit: install,
          packageManagerConfigRootDir: this.workspace.path,
          installPackages: rewrite && !reinstall ? false : true,
        },
        linkingOptions: { linkTeambitBit: !install },
        emptyRootDir: !reuseCapsules,
        getExistingAsIs: reuseCapsules && !rewrite && !reinstall,
        cachePackagesOnCapsulesRoot,
      },
      {
        dev,
        tasks: tasks ? tasks.split(',').map((task) => task.trim()) : [],
        skipTests,
        skipTasks: skipTasksParsed,
        exitOnFirstFailedTask: failFast,
      },
      {
        includeSnap,
        includeTag,
        ignoreIssues,
      }
    );
    this.logger.console(`build output can be found in path: ${envsExecutionResults.capsuleRootDir}`);
    const duration = prettyTime(process.hrtime(start));
    const succeedOrFailed = envsExecutionResults.hasErrors(loose) ? 'failed' : 'succeeded';
    const msg = `build ${succeedOrFailed}. completed in ${duration}.`;
    if (envsExecutionResults.hasErrors(loose)) {
      this.logger.consoleFailure(msg);
    }
    envsExecutionResults.throwErrorsIfExist(loose);
    return chalk.green(msg);
  }

  private async getListTasks(componentIdStr: string): Promise<string> {
    const compId = await this.workspace.resolveComponentId(componentIdStr);
    const component = await this.workspace.get(compId);
    const results = this.builder.listTasks(component);
    return `${chalk.green('Task List')}
id:    ${results.id.toString()}
envId: ${results.envId}

${chalk.bold('Build Pipeline Tasks:')}
${results.buildTasks.join('\n')}

${chalk.bold('Tag Pipeline Tasks:')}
${results.tagTasks.join('\n')}

${chalk.bold('Snap Pipeline Tasks:')}
${results.snapTasks.join('\n') || '<N/A>'}`;
  }
}
