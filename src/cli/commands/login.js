/** @flow */

export default class Login {
  name = 'login';
  description = 'login to bit';
  alias = null;
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('logging in to bit.');
    return new Promise(resolve => resolve(m));
  }
}
