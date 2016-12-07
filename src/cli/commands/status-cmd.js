/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../command';
import { status } from '../../api';
import type { StatusRes } from '../../api/lib/status';
 
export default class Status extends Command {
  name = 'status';
  description = 'show modifications status';
  alias = 's';
  opts = [];
 
  action(): Promise<StatusRes[]> {
    return status();
  }

  report(results: StatusRes[]): string {
    if (R.isEmpty(results)) {
      return chalk.red('your inline bits directory is empty');  
    }

    const valids = results.filter(r => r.valid);
    const invalids = results.filter(r => !r.valid);

    return chalk.red(invalids.map(r => r.name).join('\n')) + 
           chalk.green(valids.map(r => r.name).join('\n')); 
  }
}
