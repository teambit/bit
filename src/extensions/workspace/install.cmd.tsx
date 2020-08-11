import chalk from 'chalk';
import { Command, CommandOptions } from '../cli';
import { Workspace, WorkspaceInstallOptions } from './workspace';
import { Logger } from '../logger';

type InstallCmdOptions = WorkspaceInstallOptions;

export default class InstallCmd implements Command {
  name = 'install [packages...]';
  description = 'install dependencies';
  alias = 'in';
  group = 'component';
  shortDescription = '';
  options = [
    ['v', 'variants <variants>', 'add packages to specific variants'],
    ['t', 'type [lifecycleType]', 'runtime (default), dev or peer dependency'],
  ] as CommandOptions;

  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * logger extension.
     */
    private logger: Logger
  ) {}

  async report([packages]: [string[]], options: InstallCmdOptions) {
    const startTime = Date.now();
    this.logger.consoleTitle(`resolving dependencies for workspace: '${chalk.cyan(this.workspace.name)}'`);
    // const idsP = rawIds.map((rawId) => this.workspace.resolveComponentId(rawId));
    // const ids = await Promise.all(idsP);
    this.logger.consoleSuccess('dependencies has been resolved');
    const components = await this.workspace.install(packages, options);
    const endTime = Date.now();
    const executionTime = calculateTime(startTime, endTime);
    return `Successfully resolved dependencies for ${chalk.cyan(
      components.toArray().length.toString()
    )} component(s) in ${chalk.cyan(executionTime.toString())} seconds`;
  }
}

function calculateTime(startTime: number, endTime: number) {
  const diff = endTime - startTime;
  return diff / 1000;
}
