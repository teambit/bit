import { Command, CommandOptions } from '@teambit/cli';
import { WorkspaceDependencyLifecycleType } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import chalk from 'chalk';

import { Workspace, WorkspaceInstallOptions } from './workspace';

type InstallCmdOptions = {
  variants: string;
  type: WorkspaceDependencyLifecycleType;
  skipDedupe: boolean;
  skipImport: boolean;
  updateExisting: boolean;
  savePrefix: string;
};

export default class InstallCmd implements Command {
  name = 'install [packages...]';
  description = 'install development workspace dependencies';
  alias = 'in';
  group = 'development';
  shortDescription = '';
  options = [
    ['v', 'variants <variants>', 'add packages to specific variants'],
    ['t', 'type [lifecycleType]', '"runtime" (default) or "peer" (dev is not a valid option)'],
    ['u', 'update-existing [updateExisting]', 'update existing dependencies version and types'],
    ['', 'save-prefix [savePrefix]', 'set the prefix to use when adding dependency to workspace.jsonc'],
    ['', 'skip-dedupe [skipDedupe]', 'do not dedupe dependencies on installation'],
    ['', 'skip-import [skipImport]', 'do not import bit objects post installation'],
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

  async report([packages = []]: [string[]], options: InstallCmdOptions) {
    const startTime = Date.now();
    this.logger.console(`Resolving component dependencies for workspace: '${chalk.cyan(this.workspace.name)}'`);
    const installOpts: WorkspaceInstallOptions = {
      variants: options.variants,
      lifecycleType: options.type,
      dedupe: !options.skipDedupe,
      import: !options.skipImport,
      updateExisting: options.updateExisting,
      savePrefix: options.savePrefix,
    };
    const components = await this.workspace.install(packages, installOpts);
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
