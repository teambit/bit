import { BitError } from 'bit-bin/dist/error/bit-error';

export class PackageManagerNotFound extends BitError {
  constructor(private packageManagerName: string) {
    super(`package manager: ${packageManagerName} was not found`);
  }

  report() {
    return this.message;
  }
}
