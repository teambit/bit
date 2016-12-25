/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../command';
import { list } from '../../api';

export default class List extends Command {
  name = 'ls';
  description = 'list all box bits';
  alias = '';
  opts = [
    ['i', 'inline', 'remove inline bit']
  ];
  
  action(args: string[], opts: any): Promise<any> {
    return list();
  }

  report(bitNames: string[]): string {
    if (R.isEmpty(bitNames)) {
      return chalk.red('your external bits directory is empty');  
    }

    return chalk.green(bitNames.join('\n'));
  }

}
