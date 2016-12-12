/** @flow */
import * as pathlib from 'path';
import R from 'ramda';
import chalk from 'chalk';
import Command from '../command';
import { initScope } from '../../api';
import { Scope as scopeModel } from '../../scope';

export default class Scope extends Command {
  name = 'scope';
  description = 'manage scope(s)';
  alias = 's';
  opts = [
    ['i', 'init', 'initiate a scope']
  ];
  
  action([path, ]: [string, ], opts: any): Promise<any> {
    if (path) path = pathlib.resolve(path);
    return initScope(path); 
  }

  report({ created }: scopeModel): string {
    if (!created) return `${chalk.grey('successfully reinitialized a bit scope.')}`;
    return `${chalk.green('successfully initialized an empty bit scope.')}`;
  }
}
