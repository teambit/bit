import { BitError } from '@teambit/bit-error';

export class UnknownObjectType extends BitError {
  constructor(readonly type: string) {
    super(`BitObject: unable to find subclass "${type}"`);
  }
}
