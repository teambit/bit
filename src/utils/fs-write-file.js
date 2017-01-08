/** @flow */
import fs from 'fs-extra';

export default function writeFile(filepath: string, contents: string|Buffer): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.outputFile(filepath, contents, (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
}
