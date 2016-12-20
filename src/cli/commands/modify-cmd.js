/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { modify } from '../../api';
import Bit from '../../bit';

export default class Modify extends Command {
  name = 'modify <id>';
  description = 'modify a bit (transfer to the inline folder for modification)';
  alias = 'm';
  opts = [];
  
  action([id, ]: [string, ]): Promise<Bit> {
    return modify(id)
    .then(bit => ({
      name: bit.getName(),
      box: bit.getBox(),
      path: bit.getPath()
    }));
  }

  report({ name, box, path }: { name: string, box: string, path: string }): string {
    return chalk.white('put ') +
    chalk.magenta(`"${box}/${name}"`) +
    chalk.white(' in ') +
    chalk.green(`"${path}"`) + 
    chalk.white(' for later modification');
  }
}
