/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../command';
import { list } from '../../api';
import Component from '../../consumer/bit-component';
import { formatBit, paintHeader } from '../chalk-box';

export default class List extends Command {
  name = 'list [scope]';
  description = 'list all scope components';
  alias = 'ls';
  opts = [
    // ['i', 'inline', 'in inline bit'] @TODO
  ];
  
  action([scope]: string[], opts: any): Promise<any> {
    return list(scope);
  }

  report(components: Component[]): string {
    if (R.isEmpty(components)) {
      return chalk.red('your scope is empty');  
    }

    return R.prepend(
      paintHeader('local scope components'),
      components.map(formatBit)
    ).join('\n');
  }

}
