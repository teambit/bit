import { BitError } from '@teambit/bit-error';

export class DirPatternWithStar extends BitError {
  constructor(readonly pattern: string) {
    super(
      `the variants pattern "${pattern}" is invalid. a dir pattern should not contain "*" as it always include any subfolder by default`
    );
  }
}
