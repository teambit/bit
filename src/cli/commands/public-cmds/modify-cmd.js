/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { modify } from '../../../api/consumer';
import Bit from '../../../consumer/component';

export default class Modify extends Command {
  name = 'modify <id>';
  description = 'modify a component (transfer to the inline directory for modification)';
  alias = 'm';
  opts = [
    ['ne', 'no_env', 'no pre-import of environment bit components (tester/compiler)'],
    ['v', 'verbose', 'showing npm verbose output for inspection'],
  ];
  loader = true;

  action([id, ]: [string, ], { no_env, verbose }: { no_env?: bool, verbose?: bool }): Promise<Bit> {
    return modify({ id, no_env, verbose })
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
