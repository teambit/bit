/** @flow */
import { loadBox } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'export <name> [remote]';
  description = 'export a bit';
  alias = 'e';
  opts = [];

  action([name, remote]: [string]): Promise<any> {
    return new Promise((resolve) => {
      const box = loadBox();
      box.exportBit();
      const bit = box.get(name);
      bit.export(remote);
      bit
        .remove()
        .then(bit.import);
      box.import(name, remote);

      box.removeBit();
      
      return resolve({
        name,
      });
    });
  }

  report({ name }: any): string {
    return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
