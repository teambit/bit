import { mkdtempSync } from 'fs-extra';
import { tmpdir } from 'os';
import { sep, join } from 'path';
import { getAspectDirFromBvm } from '@teambit/aspect-loader';
import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';

export function makeTempDir(prefix = '') {
  return mkdtempSync(`${tmpdir()}${sep}${prefix}`);
}

export function getPreviewDistDir(): string {
  try {
    return toWindowsCompatiblePath(join(getAspectDirFromBvm('@teambit/preview'), 'dist'));
  } catch {
    return __dirname;
  }
}
