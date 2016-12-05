/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../command';
import { list } from '../../api';

export default class Status extends Command {
  name = 'status';
  description = 'show modifications status';
  alias = 's';
  opts = [];
 
  action(): Promise<any> {
    return list({ inline: true });
  }

  report(bitNames: string[]): string {
    if (R.isEmpty(bitNames)) {
      return chalk.red('your inline bits directory is empty');  
    }

    return chalk.green(bitNames.join('\n'));
  }
}
