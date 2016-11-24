/** @flow */

export default class Status {
  name = 'status';
  description = 'show bit modifications status';
  alias = null;
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('status here...');
    return new Promise(resolve => resolve(m));
  }
}
