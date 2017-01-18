/** @flow */
import Command from '../../command';

export default class Logout extends Command {
  name = 'logout';
  description = 'logout from bit';
  alias = '';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('logged out from bit...');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }
}
