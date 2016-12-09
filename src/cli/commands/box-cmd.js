/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../command';
// import { box } from '../../api';

export default class Box extends Command {
  name = 'box';
  description = 'manage box(s)';
  alias = 'b';
  opts = [
  ];
  
  action(args: string[], opts: any): Promise<any> {
    // return list(opts);
  }

  report(bitNames: string[]): string {
    if (R.isEmpty(bitNames)) {
      return chalk.red('your external bits directory is empty');  
    }

    return chalk.green(bitNames.join('\n'));
  }

}
