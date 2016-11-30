/** @flow */
import Command from '../command';

export default class List extends Command {
  name = 'list';
  description = 'list all repository bits';
  alias = 'ls';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('list of all bits');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }

}
