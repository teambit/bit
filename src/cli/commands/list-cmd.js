/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { list } from '../../api';

export default class List extends Command {
  name = 'list';
  description = 'list all box bits';
  alias = 'ls';
  opts = [
    ['i', 'inline', 'remove inline bit']
  ];
  
  action(args: string[], opts: any): Promise<any> {
    return list(opts).then(bitNames => ({
      bitNames
    }));
  }

  report(data: any): string {
    return chalk.green(data.bitNames.join('\n'));
  }

}
