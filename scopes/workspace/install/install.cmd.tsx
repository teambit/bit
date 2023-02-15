import { Command, CommandOptions } from '@teambit/cli';
import { WorkspaceDependencyLifecycleType } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { InstallMain, WorkspaceInstallOptions } from './install.main.runtime';

type InstallCmdOptions = {
  variants: string;
  type: WorkspaceDependencyLifecycleType;
  skipDedupe: boolean;
  skipImport: boolean;
  skipCompile: boolean;
  updateExisting: boolean;
  savePrefix: string;
  addMissingPeers: boolean;
  noOptional: boolean;
};

export default class InstallCmd implements Command {
  name = 'install [packages...]';
  description = 'installs workspace dependencies';
  extendedDescription =
    'when no package is specified, all workspace dependencies are installed and all workspace components are imported.';
  helpUrl = 'docs/dependencies/dependency-installation';
  arguments = [{ name: 'packages...', description: 'a list of packages to install (separated by spaces)' }];
  alias = 'in';
  group = 'development';
  options = [
    ['v', 'variants <variants>', 'add packages to specific variants'],
    ['t', 'type [lifecycleType]', '"runtime" (default) or "peer" (dev is not a valid option)'],
    [
      'u',
      'update-existing [updateExisting]',
      'DEPRECATED (not needed anymore, it is the default now). update existing dependencies version and types',
    ],
    ['', 'save-prefix [savePrefix]', 'set the prefix to use when adding dependency to workspace.jsonc'],
    ['', 'skip-dedupe [skipDedupe]', 'do not dedupe dependencies on installation'],
    ['', 'skip-import [skipImport]', 'do not import bit objects post installation'],
    ['', 'skip-compile [skipCompile]', 'do not compile components'],
    ['', 'add-missing-peers [addMissingPeers]', 'install all missing peer dependencies'],
    ['', 'no-optional [noOptional]', 'do not install optional dependencies (works with pnpm only)'],
  ] as CommandOptions;

  constructor(
    private install: InstallMain,
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
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (options.updateExisting) {
      this.logger.consoleWarning(
        `--update-existing is deprecated, please omit it. "bit install" will update existing dependency by default`
      );
    }
    this.logger.console(`Resolving component dependencies for workspace: '${chalk.cyan(this.workspace.name)}'`);
    const installOpts: WorkspaceInstallOptions = {
      variants: options.variants,
      lifecycleType: options.addMissingPeers ? 'peer' : options.type,
      dedupe: !options.skipDedupe,
      import: !options.skipImport,
      updateExisting: true,
      savePrefix: options.savePrefix,
      addMissingPeers: options.addMissingPeers,
      compile: !options.skipCompile,
      includeOptionalDeps: !options.noOptional,
    };
    const components = await this.install.install(packages, installOpts);
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
