/** @flow */
import Command from '../command';
import RemoteAdd from './remote/remote-add-cmd';
import RemoteRm from './remote/remote-rm-cmd';
import { remoteList } from '../../api';
import { forEach } from '../../utils';

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
  
  action(): Promise<any> {
    return remoteList();
  }

  report(remotes: {[string]: string}): string {
    const resArr = ['scope name | host'];
    forEach(remotes, (host, name) => {
      resArr.push(`${name} | ${host}`);
    });
    return resArr.join('\n');
  }
}
