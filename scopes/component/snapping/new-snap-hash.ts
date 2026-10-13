import { v4 } from 'uuid';
import { sha1 } from '@teambit/toolbox.crypto.sha1';

export function newSnapHash(): string {
  return sha1(v4());
}

export function newSnapBatchId(): string {
  return v4();
}
