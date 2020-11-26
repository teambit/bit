import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from 'bit-bin/dist/consumer/exceptions';
import chalk from 'chalk';

import { BuilderMain } from './builder.main.runtime';

export class BuilderCmd implements Command {
  name = 'build [pattern]';
  description = 'run set of tasks for build';
  alias = '';
  group = '';
  private = true;
  shortDescription = '';
  options = [
    ['', 'install', 'install core aspects in capsules'],
    ['', 'include-deps', 'include all component dependencies in the capsule context'],
  ] as CommandOptions;

  constructor(private builder: BuilderMain, private workspace: Workspace, private logger: Logger) {}

  async report(
    [userPattern]: [string],
    { install = false, includeDeps = false }: { rebuild: boolean; install: boolean; includeDeps: boolean }
  ): Promise<string> {
    const longProcessLogger = this.logger.createLongProcessLogger('build');
    const pattern = userPattern && userPattern.toString();
    if (!this.workspace) throw new ConsumerNotFound();
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();
    const envsExecutionResults = await this.builder.build(components, {
      installOptions: {
        installTeambitBit: install,
      },
      linkingOptions: { linkTeambitBit: !install },
      emptyRootDir: true,
      includeDeps,
    });
    longProcessLogger.end();
    envsExecutionResults.throwErrorsIfExist();
    this.logger.consoleSuccess();
    return chalk.green(`the build has been completed. total: ${envsExecutionResults.tasksQueue.length} tasks`);
  }
}
