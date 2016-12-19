/** @flow */
import fs from 'fs';

export default function writeFile(filename: string, contents: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.writeFile(filename, contents, (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
}
