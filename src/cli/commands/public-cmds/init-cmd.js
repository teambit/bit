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
    ['s', 'shared <groupname>', 'add group write permissions to a scope properly']
  ];

  action([path, ]: [string, ], { bare, shared }: any): Promise<{[string]: any}> {
    if (path) path = pathlib.resolve(path);

    if (bare) {
      if (typeof bare === 'boolean') bare = '';
      return initScope(path, bare, shared)
      .then(({ created }) => {
        return {
          created,
          bare: true,
        };
      });
    }

    return init(path)
      .then(({ created }) => {
        return {
          created
        };
      });
  }

  report({ created, bare }: any): string {
    if (bare) {
      // if (!created) return `${chalk.grey('successfully reinitialized a bare bit scope.')}`;
      // @TODO - a case that you already have a bit scope
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;
    }

    if (!created) return `${chalk.grey('successfully reinitialized a bit scope.')}`;
    return `${chalk.green('successfully initialized an empty bit scope.')}`;
  }
}
