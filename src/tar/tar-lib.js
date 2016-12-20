/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import { Pack as packFactory, Extract as extractFactory, Parse as parseFactory } from 'tar';
import { Reader as reader } from 'fstream';
import { bufferToReadStream } from '../utils';

const archiver = require('archiver');

export function pack(sources: string[]) {
  const archive = archiver('tar', { store: true });
  archive.on('error', (err) => {
    throw err;
  });

  sources = sources.filter(source => fs.existsSync(source));

  sources.forEach(filePath => archive.append(fs.createReadStream(filePath), {
    name: path.parse(filePath).base
  }));

  archive.finalize();
  return archive;
}

export function extract(path: string, readStream: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const extracter = extractFactory({ path })
      .on('error', reject)
      .on('end', resolve);

    readStream
      .on('error', reject)
      .pipe(extracter);
  });
}

export function getContents(tar: Buffer): Promise<{[string]: string}> {
  return new Promise((resolve, reject) => {
    const files = {};
    return bufferToReadStream(tar)
      .pipe(parseFactory())
      .on('entry', (entry) => {
        entry.on('data', (data) => {
          files[entry.path] = data;
        });
      })
      .on('end', () => resolve(files))
      .on('error', reject);
  });
}
