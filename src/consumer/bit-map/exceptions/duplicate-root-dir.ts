import { BitError } from '@teambit/bit-error';

export class DuplicateRootDir extends BitError {
  constructor(rootDir: string, ids: string[]) {
    super(`fatal: .bitmap file is invalid, it has the following components with the same rootDir "${rootDir}":
${ids.join('\n')}
this is probably a result of an incorrect git merge conflict, please edit the file and remove the incorrect entries`);
  }
}
