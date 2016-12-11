/** @flow */
import Command from '../command';
import { build } from '../../api';

const chalk = require('chalk');


export default class Build extends Command {
  name = 'build <name>';
  description = 'build a bit';
  alias = '';
  opts = [];
  
  action([name, ]: [string]): Promise<*> {
    return build({ name });
  }

  report(): string {
    return chalk.bgBlack(`- finish build cmd`);
  }
}
