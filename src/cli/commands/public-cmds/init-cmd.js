/** @flow */
import chalk from 'chalk';
import * as pathlib from 'path';
import Command from '../../command';
import { initScope } from '../../../api/scope';
import { init } from '../../../api/consumer';

export default class Init extends Command {
  name = 'init [path]';
  description = 'initialize an empty bit scope';
  alias = '';
  opts = [
    ['b', 'bare [name]', 'initialize an empty bit bare scope'],
    ['s', 'shared <groupname>', 'add group write permissions to a scope properly'],
    ['t', 'standalone [boolean]', 'do not nest component store within .git directory ']
  ];

  action([path]: [string], { bare, shared, standalone }: any): Promise<{ [string]: any }> {
    if (path) path = pathlib.resolve(path);

    if (bare) {
      if (typeof bare === 'boolean') bare = '';
      return initScope(path, bare, shared).then(({ created }) => {
        return {
          created,
          bare: true
        };
      });
    }

    return init(path, standalone).then(({ created, addedGitHooks, existingGitHooks }) => {
      return {
        created,
        addedGitHooks,
        existingGitHooks
      };
    });
  }

  report({ created, bare, addedGitHooks, existingGitHooks }: any): string {
    if (bare) {
      // if (!created) return `${chalk.grey('successfully reinitialized a bare bit scope.')}`;
      // @TODO - a case that you already have a bit scope
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;
    }

    let initMessage = `${chalk.green('successfully initialized an empty bit scope.')}`;

    if (!created) initMessage = `${chalk.grey('successfully reinitialized a bit scope.')}`;
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
