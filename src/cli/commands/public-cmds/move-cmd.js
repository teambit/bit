/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { move } from '../../../api/consumer';

export default class Move extends Command {
  name = 'move <from> <to>';
  description = 'move files or directories of component(s)';
  alias = 'mv';
  opts = [];
  loader = true;

  action([from, to]: [string, string]): Promise<*> {
    return move({ from, to });
  }

  report(filesChanged: Array<{ from: string, to: string }>): string {
    const output = filesChanged.map((file) => {
      return chalk.green(`successfully moved ${chalk.bold(file.from)} to ${chalk.bold(file.to)}`);
    });
    return output.join('\n');
  }
}
