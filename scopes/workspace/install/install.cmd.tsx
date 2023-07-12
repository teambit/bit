import { BitError } from '@teambit/bit-error';
import { Command, CommandOptions } from '@teambit/cli';
import { WorkspaceDependencyLifecycleType } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { InstallMain, WorkspaceInstallOptions } from './install.main.runtime';

type InstallCmdOptions = {
  type: WorkspaceDependencyLifecycleType;
  skipDedupe: boolean;
  skipImport: boolean;
  skipCompile: boolean;
  update: boolean;
  updateExisting: boolean;
  savePrefix: string;
  addMissingDeps: boolean;
  addMissingPeers: boolean;
  noOptional: boolean;
  recurringInstall: boolean;
};

type FormatOutputArgs = {
  numOfComps: string;
  startTime: number;
  endTime: number;
  oldNonLoadedEnvs: string[];
  recurringInstall: boolean;
};

const recurringInstallFlagName = 'recurring-install';

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
    ['t', 'type [lifecycleType]', '"runtime" (default) or "peer" (dev is not a valid option)'],
    ['u', 'update', 'update all dependencies'],
    [
      '',
      'update-existing [updateExisting]',
      'DEPRECATED (not needed anymore, it is the default now). update existing dependencies version and types',
    ],
    ['', 'save-prefix [savePrefix]', 'set the prefix to use when adding dependency to workspace.jsonc'],
    ['', 'skip-dedupe [skipDedupe]', 'do not dedupe dependencies on installation'],
    ['', 'skip-import [skipImport]', 'do not import bit objects post installation'],
    ['', 'skip-compile [skipCompile]', 'do not compile components'],
    ['', 'add-missing-deps [addMissingDeps]', 'install all missing dependencies'],
    ['', 'add-missing-peers [addMissingPeers]', 'install all missing peer dependencies'],
    [
      '',
      recurringInstallFlagName,
      'automatically run install again if there are non loaded old envs in your workspace',
    ],
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
    if (packages.length && options.addMissingDeps) {
      throw new BitError('You can not use --add-missing-deps with a list of packages');
    }
    if (options.updateExisting) {
      this.logger.consoleWarning(
        `--update-existing is deprecated, please omit it. "bit install" will update existing dependency by default`
      );
    }
    this.logger.console(`Resolving component dependencies for workspace: '${chalk.cyan(this.workspace.name)}'`);
    const installOpts: WorkspaceInstallOptions = {
      lifecycleType: options.addMissingPeers ? 'peer' : options.type,
      dedupe: !options.skipDedupe,
      import: !options.skipImport,
      updateExisting: true,
      savePrefix: options.savePrefix,
      addMissingDeps: options.addMissingDeps,
      addMissingPeers: options.addMissingPeers,
      compile: !options.skipCompile,
      includeOptionalDeps: !options.noOptional,
      updateAll: options.update,
      recurringInstall: options.recurringInstall,
    };
    const components = await this.install.install(packages, installOpts);
    const endTime = Date.now();
    const oldNonLoadedEnvs = this.install.getOldNonLoadedEnvs();
    return formatOutput({
      startTime,
      endTime,
      numOfComps: components.toArray().length.toString(),
      recurringInstall: options[recurringInstallFlagName],
      oldNonLoadedEnvs,
    });
  }
}

function calculateTime(startTime: number, endTime: number) {
  const diff = endTime - startTime;
  return diff / 1000;
}

function formatOutput({
  numOfComps,
  endTime,
  startTime,
  recurringInstall,
  oldNonLoadedEnvs,
}: FormatOutputArgs): string {
  const executionTime = calculateTime(startTime, endTime);
  const summary = chalk.green(
    `Successfully installed dependencies and compiled ${chalk.cyan(numOfComps)} component(s) in ${chalk.cyan(
      executionTime.toString()
    )} seconds`
  );
  const anotherInstallRequiredOutput = getAnotherInstallRequiredOutput(recurringInstall, oldNonLoadedEnvs);
  return anotherInstallRequiredOutput ? `\n${anotherInstallRequiredOutput}\n\n${summary}` : `\n${summary}`;
}

export function getAnotherInstallRequiredOutput(recurringInstall = false, oldNonLoadedEnvs: string[] = []): string {
  // oldNonLoadedEnvs = ['my-org.my-scope/envs/my-react-env']
  if (!oldNonLoadedEnvs.length) return '';
  const oldNonLoadedEnvsStr = oldNonLoadedEnvs.join(', ');
  const firstPart = `The following environments are not loaded: ${chalk.cyan(
    oldNonLoadedEnvsStr
  )} and doesn't contain env.jsonc file`;
  const docsLink = `Read more about how to fix this issue in:`;
  const installAgain = `Please run "bit install" again to make sure all dependencies installed correctly`;
  const flag = chalk.cyan(`--${recurringInstallFlagName}`);
  const suggestRecurringInstall = `You can add the ${flag} flag to automatically run "bit install" again. but it is recommended to fix this issue`;
  let msg = `${firstPart}\n${installAgain}\n${suggestRecurringInstall}\n${docsLink}`;

  if (recurringInstall) {
    const autoInstallAgain =
      'bit run install again for you to make sure all dependencies installed correctly, but it is recommended to fix this issue';
    msg = `${firstPart}\n${autoInstallAgain}\n${docsLink}`;
  }
  return chalk.yellow(msg);
}
