/** @flow */

export default class Edit {
  name = 'edit';
  description = 'edit a bit in your default text editor';
  alias = 'e';
  opts = [];

  action(params: Object[]): Promise<any> {
    console.log('editing bit...');
    this.name = '';
    return new Promise((resolve) => {
      resolve(params);
    });
  }
}
