import chalk from 'chalk';
import * as pathlib from 'path';
import R from 'ramda';
import { BitError } from '@teambit/bit-error';
import { init } from '../../../api/consumer';
import { getSync } from '../../../api/consumer/lib/global-config';
import { initScope } from '../../../api/scope';
import { CFG_INIT_INTERACTIVE, CFG_INIT_DEFAULT_SCOPE, CFG_INIT_DEFAULT_DIRECTORY } from '../../../constants';
import { WorkspaceConfigProps } from '../../../consumer/config/workspace-config';
import { initInteractive } from '../../../interactive';
import shouldShowInteractive from '../../../interactive/utils/should-show-interactive';
import clean from '../../../utils/object-clean';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Init implements LegacyCommand {
  name = 'init [path]';
  skipWorkspace = true;
  description = 'create or reinitialize an empty workspace';
  helpUrl = 'reference/workspace/creating-workspaces/?new_existing_project=1';
  group: Group = 'start';
  extendedDescription =
    'if the current directory is already a workspace, it validates that bit files are correct and rewrite them if needed.';
  alias = '';
  opts = [
    ['b', 'bare [name]', 'initialize an empty bit bare scope'],
    ['s', 'shared <groupname>', 'add group write permissions to a scope properly'],
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
    ['p', 'package-manager <package-manager>', 'set the package manager (npm or yarn) to be used in the workspace'],
    ['f', 'force', 'force workspace initialization without clearing local objects'],
    ['I', 'interactive', 'EXPERIMENTAL. start an interactive process'],
  ] as CommandOptions;

  action([path]: [string], flags: Record<string, any>): Promise<{ [key: string]: any }> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!_isAnyNotInteractiveFlagUsed(flags) && (flags.interactive || shouldShowInteractive(CFG_INIT_INTERACTIVE))) {
      return initInteractive();
    }
    const {
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
      packageManager,
    } = flags;
    if (path) path = pathlib.resolve(path);
    if (bare) {
      if (reset || resetHard) throw new BitError('--reset and --reset-hard flags are not available for bare scope');
      // Handle both cases init --bare and init --bare [scopeName]
      const bareVal = bare === true ? '' : bare;
      return initScope(path, bareVal, shared).then(({ created }) => {
        return {
          created,
          bare: true,
        };
      });
    }
    if (reset && resetHard) {
      throw new BitError('cannot use both --reset and --reset-hard, please use only one of them');
    }
    const workspaceConfigFileProps: WorkspaceConfigProps = {
      componentsDefaultDirectory: defaultDirectory ?? getSync(CFG_INIT_DEFAULT_DIRECTORY),
      defaultScope: defaultScope ?? getSync(CFG_INIT_DEFAULT_SCOPE),
      packageManager,
    };
    return init(
      path,
      standalone,
      noPackageJson,
      reset,
      resetNew,
      resetLaneNew,
      resetHard,
      resetScope,
      force,
      workspaceConfigFileProps
    ).then(({ created, addedGitHooks, existingGitHooks }) => {
      return {
        created,
        addedGitHooks,
        existingGitHooks,
        reset,
        resetHard,
        resetScope,
      };
    });
  }

  report({ created, bare, reset, resetHard, resetScope }: any): string {
    if (bare) {
      // if (!created) return `${chalk.grey('successfully reinitialized a bare bit scope.')}`;
      // @TODO - a case that you already have a bit scope
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;
    }

    let initMessage = `${chalk.green('successfully initialized a bit workspace.')}`;

    if (!created) initMessage = `${chalk.grey('successfully re-initialized a bit workspace.')}`;
    if (reset) initMessage = `${chalk.grey('your bit workspace has been reset successfully.')}`;
    if (resetHard) initMessage = `${chalk.grey('your bit workspace has been hard-reset successfully.')}`;
    if (resetScope) initMessage = `${chalk.grey('your local scope has been reset successfully.')}`;
    // const addedGitHooksTemplate = _generateAddedGitHooksTemplate(addedGitHooks);
    // const existingGitHooksTemplate = _generateExistingGitHooksTemplate(existingGitHooks);
    // return `${initMessage}\n${addedGitHooksTemplate}\n${existingGitHooksTemplate}`;
    return initMessage;
  }
}

function _isAnyNotInteractiveFlagUsed(flags: Record<string, any>) {
  const withoutInteractive = R.omit(['interactive'], flags);
  const cleaned = clean(withoutInteractive);
  return !R.isEmpty(cleaned);
}

// function _generateAddedGitHooksTemplate(addedGitHooks) {
//   if (addedGitHooks && addedGitHooks.length > 0) {
//     return chalk.green(`the following git hooks were added: ${addedGitHooks.join(', ')}`);
//   }
//   return '';
// }

// function _generateExistingGitHooksTemplate(existingGitHooks) {
//   if (existingGitHooks && existingGitHooks.length > 0) {
//     return chalk.yellow(
//       `warning: the following git hooks are already existing: ${existingGitHooks.join(
//         ', '
//       )}\nplease add the following code to your hooks: \`bit import\``
//     );
//   }
//   return '';
// }
