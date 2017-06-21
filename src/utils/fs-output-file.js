/** @flow */
import fs from 'fs-extra';

export default function outputFile(file: string, data) {
  return new Promise((resolve, reject) => {
    fs.outputFile(file, data, (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
}
