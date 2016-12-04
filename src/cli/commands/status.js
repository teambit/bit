/** @flow */
import Command from '../command';

export default class Status extends Command {
  name = 'status';
  description = 'show modifications status';
  alias = '';
  opts = [];
  
  action(): Promise<any> {
    const m = this.alias;
    console.log('status here...');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }
}
