/** @flow */
import { loadBox } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <name>';
  description = 'create a new bit';
  alias = 'c';
  opts = [
    ['f', 'force', 'create forcefully']
  ];

  action([name, ]: [string], opts: {[string]: boolean}): Promise<any> {
    return new Promise((resolve) => {
      const box = loadBox();
      box.createBit(name, opts);
      
      return resolve({
        path: box.path,
        name,
      });
    });
  }

  report({ name, path }: any): string {
    return chalk.green(`created bit "${name}" in "${path}"`);
  }

  handleError(err: Error) {
    if (err instanceof )
  }
}
