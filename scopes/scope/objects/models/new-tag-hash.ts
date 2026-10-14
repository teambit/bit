import { v4 } from 'uuid';
import { sha1 } from '@teambit/toolbox.crypto.sha1';

/** Allocate the object hash for a new semantic-version tag. */
export function newTagHash(): string {
  return sha1(v4());
}
