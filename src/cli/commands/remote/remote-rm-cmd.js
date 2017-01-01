/** @flow */
import Command from '../../command';
import { remoteRm } from '../../../api';

const chalk = require('chalk');

export default class RemoteRm extends Command {
  name = 'remove <name>';
  description = 'remove a tracked bit remote';
  alias = 'rm';
  opts = [
    ['g', 'global', 'remove a global configured remote scope']
  ];
  
  action([name, ]: [string, ]): Promise<any> {
    return remoteRm(name);
  }

  report(name: string): string {
    return chalk.green(`successfully removed remote ${chalk.bold(name)}`);
  }
}
