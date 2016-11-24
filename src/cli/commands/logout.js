/** @flow */

export default class Logout {
  name = 'logout';
  description = 'logout from bit';
  alias = '';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('logged out from bit...');
    return new Promise(resolve => resolve(m));
  }
}
