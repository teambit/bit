/** @flow */
import chalk from 'chalk';
import { loadBox } from '../../box';
import Command from '../command';

export default class List extends Command {
  name = 'list';
  description = 'list all box bits';
  alias = 'ls';
  opts = [];
  
  action(): Promise<any> {
    return new Promise((resolve) => {
      const box = loadBox();
      const bits = box.listBits();

      return resolve({
        bitNames: bits.map(bit => bit.name)
      });
    });
  }

  report(data: {bitNames: string[]}): string {
    return chalk.green(data.bitNames.join('\n'));
  }

}
