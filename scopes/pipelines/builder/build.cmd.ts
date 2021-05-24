import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import chalk from 'chalk';

import { BuilderMain } from './builder.main.runtime';

type BuildOpts = {
  rebuild: boolean;
  install: boolean;
  cachePackagesOnCapsulesRoot: boolean;
  reuseCapsules: boolean;
  tasks: string;
};

export class BuilderCmd implements Command {
  name = 'build [pattern]';
  description = 'run set of tasks for build';
  alias = '';
  group = 'development';
  options = [
    ['', 'install', 'install core aspects in capsules'],
    ['', 'reuse-capsules', 'avoid deleting the capsules root-dir before starting the build'],
    [
      '',
      'tasks <string>',
      `build the specified task(s) only. for multiple tasks, separate by a comma and wrap with quotes.
                            specify the task-name (e.g. "TypescriptCompiler") or the task-aspect-id (e.g. teambit.compilation/compiler)`,
    ],
    ['', 'cache-packages-on-capsule-root', 'set the package-manager cache on the capsule root'],
  ] as CommandOptions;

  constructor(private builder: BuilderMain, private workspace: Workspace, private logger: Logger) {}

  async report(
    [userPattern]: [string],
    { install = false, cachePackagesOnCapsulesRoot = false, reuseCapsules = false, tasks }: BuildOpts
  ): Promise<string> {
    const longProcessLogger = this.logger.createLongProcessLogger('build');
    const pattern = userPattern && userPattern.toString();
    if (!this.workspace) throw new ConsumerNotFound();
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();
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
}
