import { BitError } from '@teambit/bit-error';

export class ArtifactStorageError extends BitError {
  constructor(originalError: Error, idStr: string) {
    super(`failed to store artifacts for component ${idStr}.
Error: ${originalError.message}`);
  }
}
