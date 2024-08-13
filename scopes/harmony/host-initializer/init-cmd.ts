import chalk from 'chalk';
import * as pathlib from 'path';
import { BitError } from '@teambit/bit-error';
import { getSync } from '@teambit/legacy/dist/api/consumer/lib/global-config';
import { initScope } from '@teambit/legacy.scope-api';
import { CFG_INIT_DEFAULT_SCOPE, CFG_INIT_DEFAULT_DIRECTORY } from '@teambit/legacy/dist/constants';
import { WorkspaceExtensionProps } from '@teambit/config';
import { Command, CommandOptions } from '@teambit/cli';
import { HostInitializerMain } from './host-initializer.main.runtime';

export class InitCmd implements Command {
  name = 'init [path]';
  skipWorkspace = true;
  description = 'create or reinitialize an empty workspace';
  helpUrl = 'reference/workspace/creating-workspaces/?new_existing_project=1';
  group = 'start';
  extendedDescription =
    'if the current directory is already a workspace, it validates that bit files are correct and rewrite them if needed.';
  alias = '';
  loadAspects = false;
  options = [
    ['n', 'name <workspace-name>', 'name of the workspace'],
    [
      '',
      'generator <env-id>',
      'for multiple, separate by a comma. add env-ids into the generators field in the workspace config for future "bit create" templates',
    ],
    [
      'T',
      'standalone',
      'do not nest component store within .git directory and do not write config data inside package.json',
    ],
    ['', 'no-package-json', 'do not generate package.json'],
    ['r', 'reset', 'write missing or damaged Bit files'],
    ['', 'reset-new', 'reset .bitmap file as if the components were newly added and remove all model data (objects)'],
    [
      '',
      'reset-lane-new',
      'same as reset-new, but it only resets components belong to lanes. main components are left intact',
    ],
    [
      '',
      'reset-hard',
      'delete all Bit files and directories, including Bit configuration, tracking and model data. Useful for re-starting workspace from scratch',
    ],
    [
      '',
      'reset-scope',
      'removes local scope (.bit or .git/bit). tags/snaps that have not been exported will be lost. workspace is left intact',
    ],
    [
      'd',
      'default-directory <default-directory>',
      'set the default directory pattern to import/create components into',
    ],
    ['', 'default-scope <default-scope>', 'set the default scope for components in the workspace'],
    ['f', 'force', 'force workspace initialization without clearing local objects'],
    ['b', 'bare [name]', 'initialize an empty bit bare scope'],
    ['s', 'shared <groupname>', 'add group write permissions to a scope properly'],
  ] as CommandOptions;

  constructor(private hostInitializer: HostInitializerMain) {}

  private pathToName(path: string) {
    const directories = pathlib.normalize(path).split(pathlib.sep);
    const lastDir = directories[directories.length - 1];
    return lastDir;
  }

  async report([path]: [string], flags: Record<string, any>) {
    const {
      name,
      generator,
      bare,
      shared,
      standalone,
      noPackageJson,
      reset,
      resetNew,
      resetLaneNew,
      resetHard,
      resetScope,
      force,
      defaultDirectory,
      defaultScope,
    } = flags;
    if (path) path = pathlib.resolve(path);
    if (bare) {
      if (reset || resetHard) throw new BitError('--reset and --reset-hard flags are not available for bare scope');
      // Handle both cases init --bare and init --bare [scopeName]
      const bareVal = bare === true ? '' : bare;
      await initScope(path, bareVal, shared);
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;
    }
    if (reset && resetHard) {
      throw new BitError('cannot use both --reset and --reset-hard, please use only one of them');
    }

    const workspaceExtensionProps: WorkspaceExtensionProps = {
      defaultDirectory: defaultDirectory ?? getSync(CFG_INIT_DEFAULT_DIRECTORY),
      defaultScope: defaultScope ?? getSync(CFG_INIT_DEFAULT_SCOPE),
      name: name || this.pathToName(path),
    };

    const { created } = await HostInitializerMain.init(
      path,
      standalone,
      noPackageJson,
      reset,
      resetNew,
      resetLaneNew,
      resetHard,
      resetScope,
      force,
      workspaceExtensionProps,
      generator
    );

    let initMessage = `${chalk.green('successfully initialized a bit workspace.')}`;

    if (!created) initMessage = `${chalk.grey('successfully re-initialized a bit workspace.')}`;
    if (reset) initMessage = `${chalk.grey('your bit workspace has been reset successfully.')}`;
    if (resetHard) initMessage = `${chalk.grey('your bit workspace has been hard-reset successfully.')}`;
    if (resetScope) initMessage = `${chalk.grey('your local scope has been reset successfully.')}`;

    return initMessage;
  }
}
