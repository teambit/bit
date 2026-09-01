import { BitError } from '@teambit/bit-error';

export class RestoreNotSupportedByPackageManager extends BitError {
  constructor(packageManagerName: string) {
    super(`the --restore option is not supported by package manager "${packageManagerName}"`);
  }
}
