import fs from 'fs-extra';

export default function readFileP(file: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.readFile(file, 'utf-8', (err, content) => {
      if (err) return reject(err);
      return resolve(content);
    });
  });
}
