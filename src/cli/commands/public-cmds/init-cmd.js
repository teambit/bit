/** @flow */
import chalk from 'chalk';
import * as pathlib from 'path';
import Command from '../../command';
import { initScope } from '../../../api/scope';
import { init } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import GeneralError from '../../../error/general-error';

export default class Init extends Command {
  name = 'init [path]';
  description = `initialize an empty bit scope\n  https://${BASE_DOCS_DOMAIN}/docs/cli-init.html`;
  alias = '';
  opts = [
    ['b', 'bare [name]', 'initialize an empty bit bare scope'],
    ['s', 'shared <groupname>', 'add group write permissions to a scope properly'],
    [
      't',
      'standalone [boolean]',
      'do not nest component store within .git directory and do not write config data inside package.json'
    ],
    ['r', 'reset', 'write missing or damaged Bit files'],
    [
      '',
      'reset-hard',
      'delete all Bit files and directories, including Bit configuration, tracking and model data. Useful for re-start using Bit from scratch'
    ],
    ['f', 'force', 'force workspace initialization without clearing local objects']
  ];

  action([path]: [string], { bare, shared, standalone, reset, resetHard, force }: any): Promise<{ [string]: any }> {
    if (path) path = pathlib.resolve(path);
    if (bare) {
      if (reset || resetHard) throw new GeneralError('--reset and --reset-hard flags are not available for bare scope');
      if (typeof bare === 'boolean') bare = '';
      return initScope(path, bare, shared).then(({ created }) => {
        return {
          created,
          bare: true
        };
      });
    }
    if (reset && resetHard) throw new GeneralError('please use --reset or --reset-hard. not both');
    return init(path, standalone, reset, resetHard, force).then(({ created, addedGitHooks, existingGitHooks }) => {
      return {
        created,
        addedGitHooks,
        existingGitHooks,
        reset,
        resetHard
      };
    });
  }

  report({ created, bare, addedGitHooks, existingGitHooks, reset, resetHard }: any): string {
    if (bare) {
      // if (!created) return `${chalk.grey('successfully reinitialized a bare bit scope.')}`;
      // @TODO - a case that you already have a bit scope
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;
    }

    let initMessage = `${chalk.green('successfully initialized a bit workspace.')}`;

    if (!created) initMessage = `${chalk.grey('successfully reinitialized a bit workspace.')}`;
    if (reset) initMessage = `${chalk.grey('your bit workspace has been reset successfully.')}`;
    if (resetHard) initMessage = `${chalk.grey('your bit workspace has been hard-reset successfully.')}`;
    // const addedGitHooksTemplate = _generateAddedGitHooksTemplate(addedGitHooks);
    // const existingGitHooksTemplate = _generateExistingGitHooksTemplate(existingGitHooks);
    // return `${initMessage}\n${addedGitHooksTemplate}\n${existingGitHooksTemplate}`;
    return initMessage;
  }
}

function _generateAddedGitHooksTemplate(addedGitHooks) {
  if (addedGitHooks && addedGitHooks.length > 0) {
    return chalk.green(`the following git hooks were added: ${addedGitHooks.join(', ')}`);
  }
  return '';
}

function _generateExistingGitHooksTemplate(existingGitHooks) {
  if (existingGitHooks && existingGitHooks.length > 0) {
    return chalk.yellow(
      `warning: the following git hooks are already existing: ${existingGitHooks.join(
        ', '
      )}\nplease add the following code to your hooks: \`bit import\``
    );
  }
  return '';
}
