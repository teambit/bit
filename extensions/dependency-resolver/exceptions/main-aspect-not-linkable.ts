import { BitError } from 'bit-bin/dist/error/bit-error';

export class MainAspectNotLinkable extends BitError {
  constructor() {
    super(`can't link main aspect because it's name is not defined`);
  }

  report() {
    return this.message;
  }
}
