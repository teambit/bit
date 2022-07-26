import chalk from 'chalk';
import * as pathlib from 'path';
import R from 'ramda';

import { init } from '../../../api/consumer';
import { initScope } from '../../../api/scope';
import { BASE_DOCS_DOMAIN, CFG_INIT_INTERACTIVE } from '../../../constants';
import { WorkspaceConfigProps } from '../../../consumer/config/workspace-config';
import GeneralError from '../../../error/general-error';
import { initInteractive } from '../../../interactive';
import shouldShowInteractive from '../../../interactive/utils/should-show-interactive';
import clean from '../../../utils/object-clean';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Init implements LegacyCommand {
  name = 'init [path]';
  skipWorkspace = true;
  description = 'create or reinitialize an empty workspace';
  group: Group = 'start';
  extendedDescription = `https://${BASE_DOCS_DOMAIN}/workspace/creating-workspaces#initialize-a-workspace-on-an-existing-project`;
  alias = '';
  opts = [
    ['b', 'bare [name]', 'initialize an empty bit bare scope'],
    ['s', 'shared <groupname>', 'add group write permissions to a scope properly'],
    [
      'T',
      'standalone',
      'do not nest component store within .git directory and do not write config data inside package.json',
    ],
    ['r', 'reset', 'write missing or damaged Bit files'],
    ['', 'reset-new', 'reset .bitmap file as if the components were newly added and remove all model data (objects)'],
    [
      '',
      'reset-hard',
      'delete all Bit files and directories, including Bit configuration, tracking and model data. Useful for re-start using Bit from scratch',
    ],
    [
      '',
      'reset-scope',
      'removes local scope (.bit or .git/bit). snaps that were not exported will be lost. workspace left intact',
    ],
    ['d', 'default-directory <default-directory>', 'set up default directory to import components into'],
    ['p', 'package-manager <package-manager>', 'set up package manager (npm or yarn)'],
    ['f', 'force', 'force workspace initialization without clearing local objects'],
    ['', 'harmony', 'DEPRECATED. no need for this flag. Harmony is the default now'],
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
      reset,
      resetNew,
      resetHard,
      resetScope,
      force,
      defaultDirectory,
      packageManager,
    } = flags;
    if (path) path = pathlib.resolve(path);
    if (bare) {
      if (reset || resetHard) throw new GeneralError('--reset and --reset-hard flags are not available for bare scope');
      // Handle both cases init --bare and init --bare [scopeName]
      const bareVal = bare === true ? '' : bare;
      return initScope(path, bareVal, shared).then(({ created }) => {
        return {
          created,
          bare: true,
        };
      });
    }
    if (reset && resetHard) throw new GeneralError('please use --reset or --reset-hard. not both');
    const workspaceConfigFileProps: WorkspaceConfigProps = {
      componentsDefaultDirectory: defaultDirectory,
      packageManager,
    };
    return init(path, standalone, reset, resetNew, resetHard, resetScope, force, workspaceConfigFileProps).then(
      ({ created, addedGitHooks, existingGitHooks }) => {
        return {
          created,
          addedGitHooks,
          existingGitHooks,
          reset,
          resetHard,
          resetScope,
        };
      }
    );
  }

  report({ created, bare, reset, resetHard, resetScope }: any): string {
    if (bare) {
      // if (!created) return `${chalk.grey('successfully reinitialized a bare bit scope.')}`;
      // @TODO - a case that you already have a bit scope
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;
    }

    let initMessage = `${chalk.green('successfully initialized a bit workspace.')}`;

    if (!created) initMessage = `${chalk.grey('successfully reinitialized a bit workspace.')}`;
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
