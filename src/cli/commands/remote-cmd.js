/** @flow */
import Command from '../command';
import RemoteAdd from './remote/remote-add-cmd';
import RemoteRm from './remote/remote-rm-cmd';

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
    return Promise.resolve('hi');
  }

  report(data: {string: any}): string {
    return data;
  }
}
