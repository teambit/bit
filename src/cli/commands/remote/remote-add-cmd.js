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
  
  action([url, ]: [string, ]): Promise<any> {
    return remoteAdd(url);
  }

  report({ name, host }: { name: string, host: string }): string {
    return chalk.green(`added remote name '${chalk.bold(name)}' with host '${chalk.bold(host)}'`);
  }
}
