/** @flow */
import { loadBox } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <name>';
  description = 'create a new bit';
  alias = 'c';
  opts = [];

  action([name, ]: [string]): Promise<any> {
    return new Promise((resolve, reject) => {
      const box = loadBox();
      if (!box) return reject('could not find repo.');
      const bit = box.addBit(name);

      return resolve({
        path: box.path,
        name: bit.name
      });
    });
  }

  report({ name, path }: any): string {
    return chalk.green(`created bit "${name}" in "${path}"`);
  }
}
