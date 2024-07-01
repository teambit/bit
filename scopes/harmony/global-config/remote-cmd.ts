/* eslint max-classes-per-file: 0 */

import chalk from 'chalk';
import Table from 'cli-table';
import { forEach, isEmpty } from 'lodash';
import { add, list, remove } from './remote';
import { Command, CommandOptions } from '@teambit/cli';

class RemoteAdd implements Command {
  name = 'add <url>';
  description = 'add a bare-scope as a remote';
  extendedDescription = `supported protocols are [file, http].
for example: "http://localhost:3000", "file:///tmp/local-scope"`;
  alias = '';
  loadAspects = false;
  options = [['g', 'global', 'configure a remote bit scope']] as CommandOptions;

  async report([url]: [string], { global }: { global: boolean }) {
    const { name, host }: { name: string; host: string } = await add(url, global);
    return chalk.green(`added remote scope '${chalk.bold(name)}' with host '${chalk.bold(host)}'`);
  }
}

class RemoteRm implements Command {
  name = 'del <name>';
  description = 'remove a tracked bit remote';
  alias = '';
  loadAspects = false;
  options = [['g', 'global', 'remove a globally configured remote scope']] as CommandOptions;

  async report([name]: [string], { global }: { global: boolean }) {
    await remove(name, global);
    return chalk.green(`successfully removed remote ${chalk.bold(name)}`);
  }
}

export class RemoteCmd implements Command {
  name = 'remote';
  description = 'manage set of tracked bit scope(s)';
  group = 'collaborate';
  helpUrl = 'reference/scope/remote-scopes';
  alias = '';
  loadAspects = false;
  options = [['g', 'global', 'see globally configured remotes']] as CommandOptions;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  commands = [new RemoteAdd(), new RemoteRm()];

  async report(args: string[], { global }: { global: boolean }) {
    const remotes: { [key: string]: string } = await list(global);
    if (isEmpty(remotes)) return chalk.red('no configured remotes found in scope');

    const table = new Table({ head: ['scope name', 'host'], style: { head: ['cyan'] } });
    forEach(remotes, (host, name) => {
      table.push([name, host]);
    });

    return table.toString();
  }
}
