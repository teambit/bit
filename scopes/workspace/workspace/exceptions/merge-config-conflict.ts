import { BitError } from '@teambit/bit-error';

export class MergeConfigConflict extends BitError {
  constructor(filePath: string) {
    super(`unable to parse the merge-config file ${filePath} as it has unresolved conflicts`);
  }
}
