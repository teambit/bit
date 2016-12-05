/** @flow */
import Command from '../command';
import { create } from '../../api';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <name>';
  description = 'create a new bit';
  alias = 'c';
  opts = [
    ['f', 'force', 'create forcefully']
  ];

  action([name, ]: [string], opts: {[string]: boolean}): Promise<any> {
    return create(name).then(() => ({ name }));
  }

  report({ name }: any): string {
    return chalk.green(`created bit "${name}" in inline folder`);
  }
}
