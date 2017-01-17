/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { modify } from '../../api';
import Bit from '../../consumer/component';

export default class Modify extends Command {
  name = 'modify <id>';
  description = 'modify a bit (transfer to the inline directory for modification)';
  alias = 'm';
  opts = [];
  
  action([id, ]: [string, ]): Promise<Bit> {
    return modify(id)
    .then((component) => {
      return {
        name: component.name,
        box: component.box
      };
    });
  }

  report({ name, box }: { name: string, box: string, path: string }): string {
    return chalk.white('put ') +
    chalk.magenta(`"${box}/${name}"`) +
    chalk.white(' in inline_components directory for later modification');
  }
}
