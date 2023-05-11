import { BitError } from '@teambit/bit-error';
import { Component } from '@teambit/component';

export class ArtifactStorageError extends BitError {
  constructor(private originalError: Error, private component: Component) {
    super(`failed to store artifacts for component ${component.id.toString()}.
Error: ${originalError.message}`);
  }
}
