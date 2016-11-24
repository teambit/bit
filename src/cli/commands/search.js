/** @flow */

export default class Search {
  name = 'search';
  description = 'search for bits in all configured remotes';
  alias = '';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('searching bit...');
    return new Promise(resolve => resolve(m));
  }
}
