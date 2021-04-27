import { BitError } from '@teambit/bit-error';

export class MainAspectNotInstallable extends BitError {
  constructor() {
    super(`can't install main aspect because it's version or name is not defined`);
  }
}
