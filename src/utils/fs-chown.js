/** @flow */
import fs from 'fs';

export default function chown(path: string, uid: number, gid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.chown(path, uid, gid, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}
