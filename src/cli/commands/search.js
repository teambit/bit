/** @flow */
import Command from '../command';

export default class Search extends Command {
  name = 'search <query> [remote]';
  description = 'search for bits in configured remote(s)';
  alias = '';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('searching bit...');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }
}
