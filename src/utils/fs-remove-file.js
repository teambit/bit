/** @flow */
import fs from 'fs-extra';
import pathlib from 'path';

export default function removeFile(path: string, propogateDirs: boolean = false): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err, res) => {
      if (err) return reject(err);
      if (propogateDirs) {
        const { dir } = pathlib.parse(path);
        fs.readdir(dir, (e, files) => {
          if (e) return reject(err);
          if (files.length !== 0) return resolve(res);
          return fs.remove(dir, (error) => {
            if (err) return reject(error);
            resolve(res);
          });
        });
      } else {
        return resolve(res);
      }
    });
  });
}
