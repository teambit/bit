/** @flow */

export default class Init {
  name = 'init [path]';
  description = 'initialize an empty bit repository';
  alias = 'i';
  opts = [];

  action(params: Object[]): Promise<any> {
    console.log('initiating bit repository...');
    this.name = '';
    return new Promise((resolve) => {
      resolve(params);
    });
  }
}
