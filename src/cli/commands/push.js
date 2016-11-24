/** @flow */

export default class Push {
  name = 'push [remote] [name]';
  description = 'pull bit(s) from remote(s)';
  alias = 'p';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('pulling all bits..');
    return new Promise(resolve => resolve(m));
  }
}
