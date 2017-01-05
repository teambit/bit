/** @flow */
import Command from '../../command';
import { remoteAdd } from '../../../api';

const chalk = require('chalk');

export default class RemoteAdd extends Command {
  name = 'add <url>';
  description = 'add a tracked bit remote';
  alias = '';
  opts = [
    ['g', 'global', 'configure a remote bit scope']
  ];
  
  action([url, ]: [string, ], { global }: { global: boolean }): Promise<any> {
    return remoteAdd(url, global);
  }

  report({ name, host }: { name: string, host: string }): string {
    return chalk.green(`added remote scope '${chalk.bold(name)}' with host '${chalk.bold(host)}'`);
  }
}
