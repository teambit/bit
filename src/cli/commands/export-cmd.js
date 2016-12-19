/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { exportAction } from '../../api';

export default class Export extends Command {
  name = 'export <id> [remote]';
  description = 'export a bit';
  alias = 'e';
  opts = [
    ['i', 'identity-file', 'path to identity file']
  ];

  action([id, remote]: [string]): Promise<any> {
    return exportAction({ id, remote });
  }

  report(): string {
    return 'finish export command';
    // return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
