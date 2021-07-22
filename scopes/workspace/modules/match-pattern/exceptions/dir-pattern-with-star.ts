import { BitError } from '@teambit/bit-error';

export class DirPatternWithStar extends BitError {
  constructor(readonly pattern: string) {
    super(
      `variant "${pattern}" is not valid. glob patterns are not supported for file paths. by default variants applied to all sub-directories`
    );
  }
}
