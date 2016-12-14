/** @flow */
import { Pack as packFactory, Extract as extractFactory, Parse as parseFactory } from 'tar';
import { Reader as reader } from 'fstream';
import { bufferToReadStream } from '../utils';

export function pack(src: string) {
  const packer = packFactory({ noProprietary: true });
  const read = reader({ path: src, type: 'Directory' })
    .pipe(packer);

  return read;
}

// export function packFiles(files: string[]) {
  // const packer = packFactory({ noProprietary: true });
  // const read = reader({  });
// }

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

export function getContents(tar: Buffer): Promise<{}> {
  return new Promise((resolve, reject) => {
    const files = {};
    bufferToReadStream(tar)
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
