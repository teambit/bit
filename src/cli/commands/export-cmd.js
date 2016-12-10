/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { exportAction } from '../../api';

export default class Export extends Command {
  name = 'export <name> [remote]';
  description = 'export a bit';
  alias = 'e';
  opts = [];

  action([name, remote]: [string]): Promise<any> {
    return exportAction({ name, remote });
  }

  report({ name }: any): string {
    return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
