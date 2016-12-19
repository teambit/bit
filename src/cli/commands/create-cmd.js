/** @flow */
import Command from '../command';
import { create } from '../../api';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <id>';
  description = 'create a new bit';
  alias = 'c';
  opts = [
    ['f', 'force', 'create forcefully']
  ];

  action([id, ]: [string], opts: {[string]: boolean}): Promise<*> {
    return create(id)
    .then(() => ({ id }));
  }

  report({ id }: any): string {
    return chalk.green(`created bit "${id}" in inline folder`);
  }
}
