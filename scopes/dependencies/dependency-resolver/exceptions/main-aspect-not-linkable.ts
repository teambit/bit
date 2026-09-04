import { BitError } from '@teambit/bit-error';

export class MainAspectNotLinkable extends BitError {
  constructor() {
    super(`can't link main aspect because its name is not defined`);
  }
}
