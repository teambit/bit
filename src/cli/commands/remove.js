/** @flow */
import { loadBox } from '../../box';
import Bit from '../../bit';
import Command from '../command';

export default class Remove extends Command {
  name = 'remove <name>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [];
  
  action([name, ]: [string]): Promise<any> {
    return new Promise((resolve, reject) => {
      const box = loadBox();
      if (!box) return reject('could not find box.');
      const bit = Bit.load(name, box);
      bit.remove();
    });
  }

  resport(data: {string: any}): string {
    return '';
  }
}
