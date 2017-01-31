/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { modify } from '../../../api/consumer';
import Bit from '../../../consumer/component';

export default class Modify extends Command {
  name = 'modify <id>';
  description = 'modify a component (transfer to the inline directory for modification)';
  alias = 'm';
  opts = [];
  loader = { autoStart: false, text: 'importing components' };

  action([id, ]: [string, ]): Promise<Bit> {
    const loader = this.loader;
    return modify({ id, loader })
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
