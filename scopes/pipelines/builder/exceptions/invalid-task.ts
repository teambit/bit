import { BitError } from '@teambit/bit-error';

export class InvalidTask extends BitError {
  constructor(readonly taskAspectId: string, reason: string) {
    super(`task of ${taskAspectId} is invalid, ${reason}`);
  }
}
