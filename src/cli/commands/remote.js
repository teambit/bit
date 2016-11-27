/** @flow */
import Command from '../command';

export default class Remote extends Command {
  name = 'remote';
  description = 'manage set of tracked bit repositories';
  alias = '';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('see all remotes...');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }
}
