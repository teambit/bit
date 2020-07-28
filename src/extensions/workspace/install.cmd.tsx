import chalk from 'chalk';
import { Command } from '../cli';
import { Workspace } from './workspace';
import { Reporter } from '../reporter';

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
     * reporter extension.
     */
    private reporter: Reporter
  ) {}

  async report([rawIds]: [string[]]) {
    // this.reporter.title(`🎬 resolving dependencies in workspace '${this.workspace.name}'`);
    const startTime = Date.now();
    // eslint-disable-next-line no-console
    console.log(`Resolving dependencies for workspace: '${chalk.cyan(this.workspace.name)}'`);
    const ids = rawIds.map((rawId) => this.workspace.resolveComponentId(rawId));
    // @ts-ignore until david and gilad will handle resolveComponentId
    // this.reporter.subscribeAll();
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
