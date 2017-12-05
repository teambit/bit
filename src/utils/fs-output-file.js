/** @flow */
import fs from 'fs-extra';

export default function outputFile(file: string, data, override: boolean = true) {
  return new Promise((resolve, reject) => {
    if (!override && fs.existsSync(file)) return resolve(file);
    fs.outputFile(file, data, (err) => {
      if (err) return reject(err);
      return resolve(file);
    });
  });
}
