/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import { Pack as packFactory, Extract as extractFactory, Parse as parseFactory } from 'tar';
import { Reader as reader } from 'fstream';
import { bufferToReadStream } from '../utils';

const archiver = require('archiver');

function toBuffer(ab) {
  const buf = new Buffer(ab.byteLength);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}
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
        entry.on('data', (chunk) => {
          if (!files[entry.path]) {
            files[entry.path] = chunk;
            return;
          }
          files[entry.path] = Buffer.concat([files[entry.path], chunk]);
        });
      })
      .on('end', () => {
        return resolve(files);
      })
      .on('error', reject);
  });
}
