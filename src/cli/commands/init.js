/** @flow */
import * as pathlib from 'path';
import { Box } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Init extends Command {
  name = 'init [path]';
  description = 'initialize an empty bit box';
  alias = 'i';
  opts = [];

  action([path, ]: [string, ]): Promise<any> {
    return new Promise((resolve) => {
      if (path) path = pathlib.resolve(path);
      const box = Box.create(path || this.currentDir());
      
      resolve({ existed: !box.createdNow });        
    });
  }

  report({ existed }: any) {
    if (existed) return `${chalk.grey('successfully reinitialized a bit box.')}`;
    return `${chalk.green('successfully initialized an empty bit box.')}`;
  }

  /**
   * @private
   **/
  currentDir(): string {
    return process.cwd();
  }
}
