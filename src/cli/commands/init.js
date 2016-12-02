/** @flow */
import * as pathlib from 'path';
import { Box } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Init extends Command {
  name = 'init [path]';
  description = 'initialize an empty bit box';
  alias = '';
  opts = [];

  action([path, ]: [string, ]): Promise<{[string]: any}> {
    if (path) path = pathlib.resolve(path);
    return Box.create(path)
      .write()
      .then((created) => {
        return { 
          created
        };
      });
  }

  report({ created }: any) {
    if (!created) return `${chalk.grey('successfully reinitialized a bit box.')}`;
    return `${chalk.green('successfully initialized an empty bit box.')}`;
  }
}
