/** @flow */
import fs from 'fs-extra';
import { AUTO_GENERATED_STAMP } from '../constants';

export default function outputFile(file: string, data, override: boolean = true) {
  return new Promise((resolve, reject) => {
    if (!override && fs.existsSync(file)) {
      const fileContent = fs.readFileSync(file).toString();
      if (!fileContent.includes(AUTO_GENERATED_STAMP)) return resolve(file);
    }
    fs.outputFile(file, data, (err) => {
      if (err) return reject(err);
      return resolve(file);
    });
  });
}
