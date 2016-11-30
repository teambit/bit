/** @flow */
import Command from '../command';

export default class Pull extends Command {
  name = 'pull [remote] [name]';
  description = 'pull bit(s) from remote(s)';
  alias = 'p';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('pulling all bits..');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }
}
