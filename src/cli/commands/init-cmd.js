/** @flow */
import * as pathlib from 'path';
import Command from '../command';
import { init, initScope } from '../../api';

const chalk = require('chalk');

export default class Init extends Command {
  name = 'init [path]';
  description = 'initialize an empty bit consumer + scope';
  alias = '';
  opts = [
    ['b', 'bare', 'initialize an empty bit bare scope']
  ];

  action([path, ]: [string, ], { bare }: any): Promise<{[string]: any}> {
    if (path) path = pathlib.resolve(path);
    
    if (bare) {
      return initScope(path)
      .then(({ created }) => {
        return {
          created,
          bare: true
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

  report({ created, bare }: any) {
    if (bare) {
      // if (!created) return `${chalk.grey('successfully reinitialized a bare bit scope.')}`;
      // @TODO - a case that you already have a bit scope
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;  
    }

    if (!created) return `${chalk.grey('successfully reinitialized a bit scope.')}`;
    return `${chalk.green('successfully initialized an empty bit scope.')}`;
  }
}
