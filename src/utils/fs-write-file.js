/** @flow */
import { userInfo } from 'os';
import { outputFile } from 'fs-extra';
import chown from './fs-chown';
import promisify from './promisify';

export type Options = {
  uid?: ?number,
  gid?: ?number
};

export default function writeFile(path: string, contents: string | Buffer, options?: Options = {}): Promise<any> {
  return promisify(outputFile)(path, contents, options).then(() => {
    if (options.gid || options.uid) {
      const user = userInfo();
      return chown(path, options.uid || user.uid, options.gid || user.gid);
    }

    return Promise.resolve();
  });
}
