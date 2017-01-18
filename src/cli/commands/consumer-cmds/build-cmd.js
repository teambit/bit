/** @flow */
import Command from '../../command';
import { build } from '../../../api/consumer';

const chalk = require('chalk');

export default class Build extends Command {
  name = 'build <id>';
  description = 'build a bit';
  alias = '';
  opts = [];
  
  action([id, ]: [string]): Promise<*> {
    return build({ id });
  }

  report(): string {
    return chalk.bgBlack('-> finish build cmd');
  }
}
