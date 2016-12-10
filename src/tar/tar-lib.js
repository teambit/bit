/** @flow */
import { Pack as packFactory } from 'tar';
import { Reader as reader } from 'fstream';

export function pack(src: string) {
  const packer = packFactory({ noProprietary: true });
  const read = reader({ path: src, type: 'Directory' })
    .pipe(packer);

  return read;
}

export function extract() {
  
}
