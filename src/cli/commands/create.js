/** @flow */
import { loadBox } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <name>';
  description = 'create a new bit';
  alias = 'c';
  opts = [];

  action([name, force, withTests]: [string, boolean, boolean]): Promise<any> {
    return new Promise((resolve) => {
      const box = loadBox();
      box.createBit(name, {});
      
      return resolve({
        path: box.path,
        name,
      });
    });
  }

  report({ name, path }: any): string {
    return chalk.green(`created bit "${name}" in "${path}"`);
  }
}
