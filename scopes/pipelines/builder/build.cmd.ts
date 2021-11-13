import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import chalk from 'chalk';
import { BuilderMain } from './builder.main.runtime';

type BuildOpts = {
  all: boolean;
  rebuild: boolean;
  install: boolean;
  cachePackagesOnCapsulesRoot: boolean;
  reuseCapsules: boolean;
  tasks: string;
  listTasks?: string;
};

export class BuilderCmd implements Command {
  name = 'build [pattern]';
  description = 'run set of tasks for build';
  alias = '';
  group = 'development';
  options = [
    ['a', 'all', 'build all components, not only modified and new'],
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
  ] as CommandOptions;

  constructor(private builder: BuilderMain, private workspace: Workspace, private logger: Logger) {}

  async report(
    [userPattern]: [string],
    {
      all = false,
      install = false,
      cachePackagesOnCapsulesRoot = false,
      reuseCapsules = false,
      tasks,
      listTasks,
    }: BuildOpts
  ): Promise<string> {
    if (!this.workspace) throw new ConsumerNotFound();
    if (listTasks) {
      return this.getListTasks(listTasks);
    }

    const longProcessLogger = this.logger.createLongProcessLogger('build');
    const components = await this.workspace.getComponentsByUserInputDefaultToChanged(all, userPattern);
    if (!components.length) {
      return chalk.bold(
        `no components found to build. use "--all" flag to build all components or specify the ids to build, otherwise, only new and modified components will be built`
      );
    }
    this.logger.consoleSuccess(`found ${components.length} components to build`);

    const envsExecutionResults = await this.builder.build(
      components,
      {
        installOptions: {
          installTeambitBit: install,
        },
        linkingOptions: { linkTeambitBit: !install },
        emptyRootDir: !reuseCapsules,
        getExistingAsIs: reuseCapsules,
        cachePackagesOnCapsulesRoot,
      },
      {
        tasks: tasks ? tasks.split(',').map((task) => task.trim()) : [],
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
