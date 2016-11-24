/** @flow */

export default class Inline {
  name = 'inline <name>';
  description = 'override a bit in inline folder';
  alias = 'in';
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
