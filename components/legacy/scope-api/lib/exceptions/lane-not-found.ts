import { BitError } from '@teambit/bit-error';

export class LaneNotFound extends BitError {
  code: number;
  constructor(
    public scopeName: string,
    public laneName: string
  ) {
    let msg = `lane "${laneName}" was not found`;
    msg += scopeName
      ? ` in scope "${scopeName}"`
      : ` locally. Please try with scope name, e.g. my-org.my-scope/${laneName}`;

    super(msg);
    this.code = 138;
  }
}
