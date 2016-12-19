/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { exportAction } from '../../api';

export default class Export extends Command {
  name = 'export <id>';
  description = 'export a bit to local scope';
  alias = 'e';
  opts = [
  ];

  action([id]: [string]): Promise<any> {
    return exportAction({ id });
  }

  report(): string {
    return 'finish export command';
    // return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
