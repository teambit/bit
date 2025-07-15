import { Command, CommandOptions } from '@teambit/cli';
import packageNameValidate from 'validate-npm-package-name';
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
  skipWriteConfigFiles: boolean;
  update: boolean;
  updateExisting: boolean;
  savePrefix: string;
  addMissingDeps: boolean;
  skipUnavailable: boolean;
  addMissingPeers: boolean;
  noOptional: boolean;
  recurringInstall: boolean;
  lockfileOnly: boolean;
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
  helpUrl = 'reference/dependencies/dependency-installation';
  arguments = [{ name: 'packages...', description: 'a list of packages to install (separated by spaces)' }];
  alias = 'in';
  group = 'dependencies';
  options = [
    ['t', 'type [lifecycleType]', '"runtime" (default) or "peer" (dev is not a valid option)'],
    ['u', 'update', 'update all dependencies to latest version according to their semver range'],
    [
      '',
      'update-existing',
      'DEPRECATED (not needed anymore, it is the default now). update existing dependencies version and types',
    ],
    ['', 'save-prefix [savePrefix]', 'set the prefix to use when adding dependency to workspace.jsonc'],
    ['', 'skip-dedupe', 'do not dedupe dependencies on installation'],
    ['', 'skip-import', 'do not import bit objects post installation'],
    ['', 'skip-compile', 'do not compile components'],
    ['', 'skip-write-config-files', 'do not write config files (such as eslint, tsconfig, prettier, etc...)'],
    ['a', 'add-missing-deps', 'install all missing dependencies'],
    ['', 'skip-unavailable', 'when adding missing dependencies, skip those that are not found in the regisry'],
    ['', 'add-missing-peers', 'install all missing peer dependencies'],
    [
      '',
      recurringInstallFlagName,
      'automatically run install again if there are non loaded old envs in your workspace',
    ],
    ['', 'no-optional [noOptional]', 'do not install optional dependencies (works with pnpm only)'],
    ['', 'lockfile-only', 'dependencies are not written to node_modules. Only the lockfile is updated'],
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
        `--update-existing is deprecated, please omit it. "bit install" will update existing dependencies by default`
      );
    }

    packages.forEach((pkg) => {
      const pkgName = extractPackageName(pkg);
      if (!packageNameValidate(pkgName).validForNewPackages) {
        throw new Error(`the package name "${pkgName}" is invalid. please provide a valid package name.`);
      }
    });
    this.logger.console(`Resolving component dependencies for workspace: '${chalk.cyan(this.workspace.name)}'`);
    const installOpts: WorkspaceInstallOptions = {
      lifecycleType: options.addMissingPeers ? 'peer' : options.type,
      dedupe: !options.skipDedupe,
      import: !options.skipImport,
      updateExisting: true,
      savePrefix: options.savePrefix,
      addMissingDeps: options.addMissingDeps,
      skipUnavailable: options.skipUnavailable,
      addMissingPeers: options.addMissingPeers,
      compile: !options.skipCompile,
      includeOptionalDeps: !options.noOptional,
      writeConfigFiles: !options.skipWriteConfigFiles,
      updateAll: options.update,
      recurringInstall: options.recurringInstall,
      lockfileOnly: options.lockfileOnly,
      showExternalPackageManagerPrompt: true,
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
  if (!oldNonLoadedEnvs.length) return '';
  const oldNonLoadedEnvsStr = oldNonLoadedEnvs.join(', ');
  const firstPart = `Bit was not able to install all dependencies. Please run "${chalk.cyan('bit install')}" again `;
  const flag = chalk.cyan(`--${recurringInstallFlagName}`);
  const suggestRecurringInstall = recurringInstall ? '' : `(or use the "${flag}" option next time).`;
  const envsStr = `The following environments need to add support for "dependency policy" to fix the warning: ${chalk.cyan(
    oldNonLoadedEnvsStr
  )}`;
  const docsLink = `Read more about how to fix this issue in: https://bit.dev/blog/using-a-static-dependency-policy-in-a-legacy-env-lihfbt9b`;

  const msg = `${firstPart}${suggestRecurringInstall}\n${envsStr}\n${docsLink}`;
  return chalk.yellow(msg);
}

function extractPackageName(packageString: string): string {
  if (!packageString) return '';

  // Handle https and git protocols. We don't allow "file" protocol here. It won't work for the consumer.
  const allowedPrefixes = ['https://', 'git:', 'git+ssh://', 'git+https://'];
  if (allowedPrefixes.some((prefix) => packageString.startsWith(prefix))) {
    return packageString;
  }

  // If it's a scoped package
  if (packageString.startsWith('@')) {
    // Find the second '@' (first is for scope, second is for version/tag)
    const atIndex = packageString.indexOf('@', 1);
    if (atIndex === -1) return packageString;
    const possibleVersion = packageString.slice(atIndex + 1);
    // If the part after the second '@' contains a slash, it's not a version/tag
    if (possibleVersion.includes('/')) return packageString;
    return packageString.slice(0, atIndex);
  }

  // For unscoped packages, split at the last '@'
  const lastAtIndex = packageString.lastIndexOf('@');
  if (lastAtIndex <= 0) return packageString;
  return packageString.slice(0, lastAtIndex);
}
