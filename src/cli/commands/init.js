/** @flow */
import * as pathlib from 'path';
import { Repository } from '../../repository';
import Command from '../command';

const chalk = require('chalk');

export default class Init extends Command {
  name = 'init [path]';
  description = 'initialize an empty bit repository';
  alias = 'i';
  opts = [];

  action([path, ]: [string, ]): Promise<any> {
    return new Promise((resolve) => {
      if (path) path = pathlib.resolve(path);
      const repo = Repository.create(path || this.currentDir());
      
      resolve({ existed: !repo.createdNow });        
    });
  }

  report({ existed }: any) {
    if (existed) return `${chalk.grey('successfully reinitialized a bit repository.')}`;
    return `${chalk.green('successfully initialized an empty bit repository.')}`;
  }

  /**
   * @private
   **/
  currentDir(): string {
    return process.cwd();
  }
}
