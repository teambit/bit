import { BitError } from '@teambit/bit-error';

export class NoIdMatchWildcard extends BitError {
  constructor(public idsWithWildcards: string[]) {
    super(`unable to find component ids that match the following: ${idsWithWildcards.join(', ')}`);
  }
}
