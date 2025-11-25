import { BitError } from '@teambit/bit-error';

export class NothingToCompareTo extends BitError {
  constructor(public id: string) {
    super('no previous versions to compare');
  }
}
