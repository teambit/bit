/** @flow */
import { loadBox } from '../../box';
import Bit from '../../bit';
import Command from '../command';

export default class Remove extends Command {
  name = 'remove <name>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [
    ['-i, --inline', 'remove inline bit'],
    ['-e, --external', 'remove external bit']
  ] ;
  
  action([name,opts ]: [string]): Promise<any> {
    return new Promise((resolve, reject) => {
      const box = loadBox('/var/www/playground/bit-testing/');
      const removedBit = box.removeBit(name,);
      
      return resolve({
        path: removedBit.path,
        name
      });
    });
  }

  report(data: {string: any}): string {
    return '';
  }
}
