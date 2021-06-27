import { BitError } from '@teambit/bit-error';

export class InvalidVersionWithPrefix extends BitError {
  constructor(version: string) {
    super(`the version ${version} is invalid. your prefix might be invalid`);
  }
}
