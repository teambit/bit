import chalk from 'chalk';
import { Command } from '../cli';
import { Workspace } from './workspace';
import { Logger } from '../logger';

export default class InstallCmd implements Command {
  name = 'install [id...]';
  description = 'install all component dependencies';
  alias = 'in';
  group = 'component';
  shortDescription = '';
  options = [];

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

  async report([rawIds]: [string[]]) {
    const startTime = Date.now();
    this.logger.consoleTitle(`Resolving dependencies for workspace: '${chalk.cyan(this.workspace.name)}'`);
    const idsP = rawIds.map((rawId) => this.workspace.resolveComponentId(rawId));
    const ids = await Promise.all(idsP);
    const components = await this.workspace.install(ids);
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
