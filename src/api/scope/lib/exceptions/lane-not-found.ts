import { BitError } from '@teambit/bit-error';

export class LaneNotFound extends BitError {
  code: number;
  constructor(public scopeName: string, public laneName: string) {
    let msg = `lane "${laneName}" was not found`;
    msg += scopeName ? ` in scope "${scopeName}"` : '. please specify a scope-name.';

    super(msg);
    this.code = 138;
  }
}
