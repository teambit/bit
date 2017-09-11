/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { move } from '../../../api/consumer';

export default class Move extends Command {
  name = 'move <id> <from> <to>';
  description = 'move files or directories of a component';
  alias = 'mv';
  opts = [];
  loader = true;

  action([id, from, to]: [string, string, string]): Promise<*> {
    return move({ id, from, to });
  }

  report(filesChanged: Array<{ from: string, to: string }>): string {
    const output = filesChanged.map((file) => {
      return chalk.green(`successfully moved ${chalk.bold(file.from)} to ${chalk.bold(file.to)}`);
    });
    return output.join('\n');
  }
}
