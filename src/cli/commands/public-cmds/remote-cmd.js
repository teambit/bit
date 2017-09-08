/** @flow */
import chalk from 'chalk';
import Table from 'cli-table2';
import Command from '../../command';
import { remoteList, remoteAdd, remoteRm } from '../../../api/consumer';
import { forEach, empty } from '../../../utils';
import RemoteUndefined from '../exceptions/remote-undefined';

export default class Remote extends Command {
  name = 'remote';
  description = 'manage set of tracked bit scope(s)';
  alias = '';
  opts = [['g', 'global', 'see globally configured remotes']];
  commands = [new RemoteAdd(), new RemoteRm()];

  // $FlowFixMe
  action(args: string[], { global }: { glboal: boolean }): Promise<any> {
    return remoteList(global);
  }

  report(remotes: { [string]: string }): string {
    if (empty(remotes)) return chalk.red('no configured remotes found in scope');

    const table = new Table({
      head: [chalk.cyan('scope name'), chalk.cyan('host')],
      colWidths: [30, 100],
      // The soft wrap here won't really work because there is no spaces in the hostname
      // See here: https://github.com/jamestalmage/cli-table2/issues/18
      wordWrap: true
    });

    forEach(remotes, (host, name) => {
      table.push([name, host]);
    });

    return table.toString();
  }
}

class RemoteAdd extends Command {
  name = 'add <url>';
  description = 'add a tracked bit remote';
  alias = '';
  opts = [['g', 'global', 'configure a remote bit scope']];

  action([url]: [string], { global }: { global: boolean }): Promise<any> {
    try {
      if (!url) return Promise.reject(new RemoteUndefined());
      return remoteAdd(url, global);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  report({ name, host }: { name: string, host: string }): string {
    return chalk.green(`added remote scope '${chalk.bold(name)}' with host '${chalk.bold(host)}'`);
  }
}

class RemoteRm extends Command {
  name = 'rm <name>';
  description = 'remove a tracked bit remote';
  alias = '';
  opts = [['g', 'global', 'remove a global configured remote scope']];

  action([name]: [string], { global }: { global: boolean }): Promise<any> {
    return remoteRm(name, global);
  }

  report(name: string): string {
    return chalk.green(`successfully removed remote ${chalk.bold(name)}`);
  }
}
