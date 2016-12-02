/** @flow */
const mkdir = require('mkdirp');

export default function mkdirp(path: string, opts: {} = {}): Promise<boolean> {
  return new Promise((resolve, reject) => {
    mkdir(path, opts, (err) => {
      if (err) return reject(err);
      return resolve(true);
    });
  });
} 
