import fs from 'fs-extra';
import { isAbsolute } from 'path';

import { BitError } from '@teambit/bit-error';
import { PathOsBasedAbsolute } from '../path';

export default function moveSync(src: PathOsBasedAbsolute, dest: PathOsBasedAbsolute, options?: Record<string, any>) {
  if (!isAbsolute(src) || !isAbsolute(dest)) {
    throw new Error(`moveSync, src and dest must be absolute. Got src "${src}", dest "${dest}"`);
  }
  try {
    fs.moveSync(src, dest, options);
  } catch (err: any) {
    if (err.message.includes('Cannot move') && err.message.includes('into itself')) {
      throw new BitError(`unable to move '${src}' into itself '${dest}'`);
    }
    throw err;
  }
}
