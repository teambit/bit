/** @flow */
import Command from '../command';

export default class Search extends Command {
  name = 'search <query>';
  description = 'search for bits in all configured remotes';
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
