/* eslint max-classes-per-file: 0 */

import chalk from 'chalk';
import Table from 'cli-table';

import { remoteAdd, remoteList, remoteRm } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { empty, forEach } from '../../../utils';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import RemoteUndefined from '../exceptions/remote-undefined';

class RemoteAdd implements LegacyCommand {
  name = 'add <url>';
  description = 'add a bare-scope as a remote';
  extendedDescription = `supported protocols are [file, http].
for example: "http://localhost:3000", "file:///tmp/local-scope"`;
  alias = '';
  opts = [['g', 'global', 'configure a remote bit scope']] as CommandOptions;

  action([url]: [string], { global }: { global: boolean }): Promise<any> {
    try {
      if (!url) return Promise.reject(new RemoteUndefined());
      return remoteAdd(url, global);
    } catch (err: any) {
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
  description = 'manage set of tracked bit scope(s)';
  group: Group = 'collaborate';
  extendedDescription = `https://${BASE_DOCS_DOMAIN}/scope/remote-scopes`;
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

    const table = new Table({ head: ['scope name', 'host'], style: { head: ['cyan'] } });
    forEach(remotes, (host, name) => {
      table.push([name, host]);
    });

    return table.toString();
  }
}
