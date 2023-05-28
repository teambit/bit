import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { BuilderMain } from './builder.main.runtime';

type BuildOpts = {
  all: boolean; // deprecated. use unmodified
  unmodified?: boolean;
  dev: boolean;
  rebuild: boolean;
  install: boolean;
  cachePackagesOnCapsulesRoot: boolean;
  reuseCapsules: boolean;
  tasks: string;
  listTasks?: string;
  skipTests?: boolean;
  failFast?: boolean;
};

export class BuilderCmd implements Command {
  name = 'build [component-pattern]';
  description = 'run set of tasks for build';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  helpUrl = 'reference/build-pipeline/builder-overview';
  alias = '';
  group = 'development';
  options = [
    ['a', 'all', 'DEPRECATED. use --unmodified'],
    ['u', 'unmodified', 'include unmodified components (by default, only new and modified components are built)'],
    ['d', 'dev', 'run the pipeline in dev mode'],
    ['', 'install', 'install core aspects in capsules'],
    ['', 'reuse-capsules', 'avoid deleting the capsules root-dir before starting the build'],
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
    ['', 'skip-tests', 'skip running component tests during tag process'],
    [
      '',
      'fail-fast',
      'stop pipeline execution on the first failed task (by default a task is skipped only when its dependent failed)',
    ],
  ] as CommandOptions;

  constructor(private builder: BuilderMain, private workspace: Workspace, private logger: Logger) {}

  async report(
    [pattern]: [string],
    {
      all = false,
      unmodified = false,
      dev = false,
      install = false,
      cachePackagesOnCapsulesRoot = false,
      reuseCapsules = false,
      tasks,
      listTasks,
      skipTests,
      failFast,
    }: BuildOpts
  ): Promise<string> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (all) {
      this.logger.consoleWarning(`--all is deprecated, please use --unmodified instead`);
      unmodified = true;
    }
    if (listTasks) {
      return this.getListTasks(listTasks);
    }

    const longProcessLogger = this.logger.createLongProcessLogger('build');
    const components = await this.workspace.getComponentsByUserInput(unmodified, pattern, true);
    if (!components.length) {
      return chalk.bold(
        `no components found to build. use "--unmodified" flag to build all components or specify the ids to build, otherwise, only new and modified components will be built`
      );
    }
    this.logger.consoleSuccess(`found ${components.length} components to build`);
    const envsExecutionResults = await this.builder.build(
      components,
      {
        installOptions: {
          installTeambitBit: install,
          packageManagerConfigRootDir: this.workspace.path,
        },
        linkingOptions: { linkTeambitBit: !install },
        emptyRootDir: !reuseCapsules,
        getExistingAsIs: reuseCapsules,
        cachePackagesOnCapsulesRoot,
      },
      {
        dev,
        tasks: tasks ? tasks.split(',').map((task) => task.trim()) : [],
        skipTests,
        exitOnFirstFailedTask: failFast,
      }
    );
    longProcessLogger.end();
    envsExecutionResults.throwErrorsIfExist();
    this.logger.consoleSuccess();
    return chalk.green(`the build has been completed. total: ${envsExecutionResults.tasksQueue.length} tasks`);
  }

  private async getListTasks(componentIdStr: string): Promise<string> {
    const compId = await this.workspace.resolveComponentId(componentIdStr);
    const component = await this.workspace.get(compId);
    const results = this.builder.listTasks(component);
    return `${chalk.green('Tasks List')}
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
