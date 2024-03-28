import { mkdtempSync } from 'fs-extra';
import { tmpdir } from 'os';
import { sep, join } from 'path';
import { getAspectDirFromBvm } from '@teambit/aspect-loader';

export function makeTempDir(prefix = '') {
  return mkdtempSync(`${tmpdir()}${sep}${prefix}`);
}

export function getPreviewDistDir(): string {
  try {
    return join(getAspectDirFromBvm('@teambit/preview'), 'dist');
  } catch (err) {
    return __dirname;
  }
}
