/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { loadConsumer } from '../../../consumer';

export default class Add extends Command {
  name = 'add <id>';
  description = 'Track a new component (add to bit.lock file)';
  alias = 'a';
  opts = [];
  loader = true;

  action([id, ]: [string]): Promise<*> {
    return loadConsumer().then(consumer => consumer.addComponent(id));
  }

  report(result: Object): string {
    return chalk.green(`${result.added} has been added to bit.lock`);
  }
}
