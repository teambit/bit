/** @flow */

export default class Remote {
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
