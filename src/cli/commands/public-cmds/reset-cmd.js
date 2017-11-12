/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { reset } from '../../../api/consumer';

export default class Reset extends Command {
  name = 'reset <id>';
  description = 'revert a component version to previous one.';
  alias = '';
  opts = [];
  loader = true;
  migration = true;

  action([id]: [string]): Promise<Object> {
    return reset({ id }).then((component) => {
      return {
        name: component.name,
        box: component.box
      };
    });
  }

  report({ name, box }: { name: string, box: string, path: string }): string {
    return (
      chalk.white('put back ') + chalk.magenta(`"${box}/${name}"`) + chalk.white(' in inline_components directory')
    );
  }
}
