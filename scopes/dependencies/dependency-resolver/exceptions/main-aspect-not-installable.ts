import { BitError } from '@teambit/bit-error';

export class MainAspectNotInstallable extends BitError {
  constructor() {
    super(`can't install main aspect because its version or name is not defined`);
  }
}
