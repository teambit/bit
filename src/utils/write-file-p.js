import fs from 'fs-extra';

export default function writeFileP(file: string, content: string): Promise<*> {
  return new Promise((resolve, reject) => {
    fs.outputFile(file, content, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}
