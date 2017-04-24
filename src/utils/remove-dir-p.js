import fs from 'fs-extra';

export default function removeDirP(dir: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.remove(dir, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}
