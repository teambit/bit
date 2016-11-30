/** @flow */
import Command from '../command';

export default class Test extends Command {
  name = 'test [name]';
  description = 'run bit(s) unit tests';
  alias = 't';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('testing bits...');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }
}
