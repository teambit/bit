/** @flow */
import fs from 'fs';

export default function readFile(path: string) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
}
