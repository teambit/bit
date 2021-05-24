/* eslint max-classes-per-file: 0 */

import chalk from 'chalk';
import Table from 'tty-table';

import { remoteAdd, remoteList, remoteRm } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { empty, forEach } from '../../../utils';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import RemoteUndefined from '../exceptions/remote-undefined';

class RemoteAdd implements LegacyCommand {
  name = 'add <url>';
  description = 'add a tracked bit remote';
  alias = '';
  opts = [['g', 'global', 'configure a remote bit scope']] as CommandOptions;

  action([url]: [string], { global }: { global: boolean }): Promise<any> {
    try {
      if (!url) return Promise.reject(new RemoteUndefined());
      return remoteAdd(url, global);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  report({ name, host }: { name: string; host: string }): string {
    return chalk.green(`added remote scope '${chalk.bold(name)}' with host '${chalk.bold(host)}'`);
  }
}

class RemoteRm implements LegacyCommand {
  name = 'del <name>';
  description = 'remove a tracked bit remote';
  alias = '';
  opts = [['g', 'global', 'remove a global configured remote scope']] as CommandOptions;

  action([name]: [string], { global }: { global: boolean }): Promise<any> {
    return remoteRm(name, global);
  }

  report(name: string): string {
    return chalk.green(`successfully removed remote ${chalk.bold(name)}`);
  }
}

export default class Remote implements LegacyCommand {
  name = 'remote';
  shortDescription = 'manage set of tracked bit scope(s)';
  group: Group = 'collaborate';
  description = `manage set of tracked bit scope(s)\n  https://${BASE_DOCS_DOMAIN}/docs/bit-server#working-with-remote-scopes`;
  alias = '';
  opts = [['g', 'global', 'see globally configured remotes']] as CommandOptions;
  migration = true;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  commands = [new RemoteAdd(), new RemoteRm()];

  action(args: string[], { global }: { global: boolean }): Promise<any> {
    return remoteList(global);
  }

  report(remotes: { [key: string]: string }): string {
    if (empty(remotes)) return chalk.red('no configured remotes found in scope');

    const header = [
      { value: 'scope name', width: 30, headerColor: 'cyan' },
      { value: 'host', width: 100, headerColor: 'cyan' },
    ];
    const opts = {
      align: 'left',
    };

    const table = new Table(header, [], opts);

    forEach(remotes, (host, name) => {
      table.push([name, host]);
    });

    return table.render();
  }
}
