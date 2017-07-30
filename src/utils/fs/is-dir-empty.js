/** @flow */
import fs from 'fs';

export default function isDirEmpty(dirPath: string, cb: (itDoes: boolean) => void) {
  fs.readdir(dirPath, (err, files) => {
    if (err) throw err;
    if (!files.length) return cb(true);
    return cb(false);
  });
}
