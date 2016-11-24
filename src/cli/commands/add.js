/** @flow */

export default class Add {
  name = 'add <name>';
  description = 'create a new bit';
  alias = 'a';
  
  action([name, ]: [string]): Promise<any> {
    const m = this.alias;
    console.log(`bit ${name} was created...`);
    return new Promise(resolve => resolve(m));
  }
}
