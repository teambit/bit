import { BitError } from '@teambit/bit-error';

export class PackageManagerNotFound extends BitError {
  constructor(packageManagerName: string) {
    super(`package manager: ${packageManagerName} was not found`);
  }
}
