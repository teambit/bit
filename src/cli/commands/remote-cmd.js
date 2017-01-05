/** @flow */
import Command from '../command';
import RemoteAdd from './remote/remote-add-cmd';
import RemoteRm from './remote/remote-rm-cmd';
import { remoteList } from '../../api';
import { forEach, empty } from '../../utils';

const chalk = require('chalk');

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
