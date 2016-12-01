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
      const removedBit = box.removeBit(name);
      
      return resolve({
        path: removedBit.path,
        name
      });
    });
  }

  resport(data: {string: any}): string {
    return '';
  }
}
