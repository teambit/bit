/** @flow */

export default class Modify {
  name = 'modify <name>';
  description = 'modify a bit in inline folder';
  alias = 'm';
  opts = [];
  
  action([name, ]: [string]): Promise<any> {
    const m = this.alias;
    console.log(`bit ${name} moved to inline...`);
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '';
  }
}
