/** @flow */
import Command from '../../command';
import { remoteRm } from '../../../api';

const chalk = require('chalk');

export default class RemoteRm extends Command {
  name = 'rm <name>';
  description = 'remove a tracked bit remote';
  alias = '';
  opts = [
    ['g', 'global', 'remove a global configured remote scope']
  ];
  
  action([name, ]: [string, ], { global }: { global: boolean }): Promise<any> {
    return remoteRm(name, global);
  }

  report(name: string): string {
    return chalk.green(`successfully removed remote ${chalk.bold(name)}`);
  }
}
