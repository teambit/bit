/** @flow */
import * as pathlib from 'path';
import Command from '../command';
import { init } from '../../api';

const chalk = require('chalk');

export default class Init extends Command {
  name = 'init [path]';
  description = 'initialize an empty bit workspace';
  alias = '';
  opts = [];

  action([path, ]: [string, ]): Promise<{[string]: any}> {
    if (path) path = pathlib.resolve(path);
    return init(path)
      .then(({ created }) => {
        return { 
          created
        };
      });
  }

  report({ created }: any) {
    if (!created) return `${chalk.grey('successfully reinitialized a bit workspace.')}`;
    return `${chalk.green('successfully initialized an empty bit workspace.')}`;
  }
}
