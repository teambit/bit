/** @flow */
import chalk from 'chalk';
import Table from 'tty-table';
import Command from '../../command';
import { remoteList, remoteAdd, remoteRm } from '../../../api/consumer';
import { forEach, empty } from '../../../utils';
import RemoteUndefined from '../exceptions/remote-undefined';

export default class Remote extends Command {
  name = 'remote';
  description = 'manage set of tracked bit scope(s)';
  alias = '';
  opts = [['g', 'global', 'see globally configured remotes']];
  migration = true;
  commands = [new RemoteAdd(), new RemoteRm()];

  // $FlowFixMe
  action(args: string[], { global }: { glboal: boolean }): Promise<any> {
    return remoteList(global);
  }

  report(remotes: { [string]: string }): string {
    if (empty(remotes)) return chalk.red('no configured remotes found in scope');

    const header = [
      { value: 'scope name', width: 30, headerColor: 'cyan' },
      { value: 'host', width: 100, headerColor: 'cyan' }
    ];
    const opts = {
      align: 'left'
    };

    const table = new Table(header, [], opts);

    forEach(remotes, (host, name) => {
      table.push([name, host]);
    });

    return table.render();
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
