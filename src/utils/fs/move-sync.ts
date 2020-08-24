import fs from 'fs-extra';
import { isAbsolute } from 'path';

import GeneralError from '../../error/general-error';
import { PathOsBasedAbsolute } from '../path';

export default function moveSync(src: PathOsBasedAbsolute, dest: PathOsBasedAbsolute, options?: Record<string, any>) {
  if (!isAbsolute(src) || !isAbsolute(dest)) {
    throw new Error(`moveSync, src and dest must be absolute. Got src "${src}", dest "${dest}"`);
  }
  try {
    fs.moveSync(src, dest, options);
  } catch (err) {
    if (err.message.includes('Cannot move') && err.message.includes('into itself')) {
      throw new GeneralError(`unable to move '${src}' into itself '${dest}'`);
    }
    throw err;
  }
}
