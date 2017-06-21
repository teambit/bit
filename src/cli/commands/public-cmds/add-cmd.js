/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { add } from '../../../api/consumer';

export default class Add extends Command {
  name = 'add <path> <id>';
  description = 'Track a new component (add to bit.lock file)';
  alias = 'a';
  opts = [];
  loader = true;

  action([path, id]: [string]): Promise<*> {
    return add(path, id);
  }

  report(result: Object): string {
    return chalk.green(`${result.added} has been added to bit.lock`);
  }
}
