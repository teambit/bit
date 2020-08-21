import { mkdtempSync } from 'fs-extra';
import { tmpdir } from 'os';
import { sep } from 'path';

export function makeTempDir(prefix = '') {
  return mkdtempSync(`${tmpdir()}${sep}${prefix}`);
}
