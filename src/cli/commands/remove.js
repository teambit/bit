/** @flow */

export default class Remove {
  name = 'remove <name>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [];
  
  action([name, ]: [string]): Promise<any> {
    return new Promise(resolve => {
      
    });
  }

  report(data: {string: any}): string {
    return '';
  }
}
