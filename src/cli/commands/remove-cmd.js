/** @flow */
import Command from '../command';
import { remove } from '../../api';

export default class Remove extends Command {
  name = 'remove <name>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [
    ['i', 'inline', 'remove inline bit'],
    ['e', 'external', 'remove external bit']
  ];
  
  action([name]: [string], opts: Array<Array<String>>): Promise<any> {
    return new Promise((resolve, reject) => {
      remove(name);
      console.log(opts);
      return resolve({
        name
      });
    });
  }

  report({ name }: any): string {
    return `removed the bit "${name}"`;
  }
}
