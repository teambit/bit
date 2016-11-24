/** @flow */
import { loadRepository } from '../../Repository';

export default class Add {
  name = 'add <name>';
  description = 'create a new bit';
  alias = 'a';
  opts = [];

  action([name, ]: [string]): Promise<any> {
    return new Promise((resolve, reject) => {
      const repo = loadRepository();
      if (!repo) return reject('could not find repo...');
      return resolve({
        path: repo.path
      });
    });
  }

  report(data: {string: any}): string {
    return `found repo in ${data.path}...`;
  }
}
