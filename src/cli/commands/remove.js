/** @flow */
import { loadRepository } from '../../repository';
import Bit from '../../bit';
import Command from '../command';

export default class Remove extends Command {
  name = 'remove <name>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [];
  
  action([name, ]: [string]): Promise<any> {
    return new Promise((resolve, reject) => {
      const repo = loadRepository();
      if (!repo) return reject('could not find repo.');
      const bit = Bit.load(name, repo);
      bit.remove();
    });
  }

  report(data: {string: any}): string {
    return '';
  }
}
