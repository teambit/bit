/** @flow */
import Command from '../command';

export default class Export extends Command {
  name = 'export <name>';
  description = 'export a bit';
  alias = 'e';
  opts = [];

  action(params: Object[]): Promise<any> {
    console.log('editing bit...');
    this.name = '';
    return new Promise((resolve) => {
      resolve(params);
    });
  }

  report(data: {string: any}): string {
    return '';
  }

}
