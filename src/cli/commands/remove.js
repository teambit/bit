/** @flow */

export default class Remove {
  name = 'remove';
  description = 'remove a bit';
  alias = 'rm';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('removed bit...');
    return new Promise(resolve => resolve(m));
  }
}
