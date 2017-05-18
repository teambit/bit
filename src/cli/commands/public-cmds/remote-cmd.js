/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { remoteList, remoteAdd, remoteRm } from '../../../api/consumer';
import { forEach, empty } from '../../../utils';

export default class Remote extends Command {
  name = 'remote';
  description = 'manage set of tracked bit scope(s)';
  alias = '';
  opts = [
    ['g', 'global', 'see globally configured remotes']
  ];
  commands = [
    new RemoteAdd(),
    new RemoteRm()
  ];

  // $FlowFixMe
  action(args: string[], { global }: { glboal: boolean }): Promise<any> {
    return remoteList(global);
  }

  report(remotes: {[string]: string}): string {
    if (empty(remotes)) return chalk.red('no configured remotes found in scope');
    const resArr = ['scope name | host'];
    forEach(remotes, (host, name) => {
      resArr.push(`${name} | ${host}`);
    });
    return resArr.join('\n');
  }
}

class RemoteAdd extends Command {
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

class RemoteRm extends Command {
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
