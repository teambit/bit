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
  shortDescription = '';
  options = [
    ['', 'install', 'install core aspects in capsules'],
    ['', 'cache-packages-on-capsule-root', 'set the package-manager cache on the capsule root'],
  ] as CommandOptions;

  constructor(private builder: BuilderMain, private workspace: Workspace, private logger: Logger) {}

  async report(
    [userPattern]: [string],
    {
      install = false,
      cachePackagesOnCapsulesRoot = false,
    }: { rebuild: boolean; install: boolean; cachePackagesOnCapsulesRoot: boolean }
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
      cachePackagesOnCapsulesRoot,
    });
    longProcessLogger.end();
    envsExecutionResults.throwErrorsIfExist();
    this.logger.consoleSuccess();
    return chalk.green(`the build has been completed. total: ${envsExecutionResults.tasksQueue.length} tasks`);
  }
}
