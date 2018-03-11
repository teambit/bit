/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { move } from '../../../api/consumer';
import type { PathChangeResult } from '../../../consumer/bit-map/bit-map';

export default class Move extends Command {
  name = 'move <from> <to>';
  description = 'move files or directories of component(s)\n  https://docs.bitsrc.io/docs/cli-move.html';
  alias = 'mv';
  opts = [];
  loader = true;

  action([from, to]: [string, string]): Promise<*> {
    return move({ from, to });
  }

  report(componentsChanged: PathChangeResult[]): string {
    const output = componentsChanged.map((component) => {
      const title = chalk.green(`Updated component ${component.id}:\n`);
      const files = component.changes.map(file => `from ${chalk.bold(file.from)} to ${chalk.bold(file.to)}\n`);
      return title + files;
    });
    return output.join('\n');
  }
}
