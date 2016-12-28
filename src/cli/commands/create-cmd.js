/** @flow */
import Command from '../command';
import { create } from '../../api';
import Bit from '../../bit';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <id>';
  description = 'create a new bit';
  alias = 'c';
  opts = [
    ['s', 'specs', 'create specs file automatically']
  ];

  action([id, ]: [string], { specs }: any): Promise<*> {
    return create(id, specs);
  }

  report(bit: Bit): string {
    const name = bit.getName();
    const box = bit.getBox();
    const bitPath = bit.getPath();

    return chalk.green(`created bit "${name}" in box "${box}" at "${bitPath}"`);
  }
}
