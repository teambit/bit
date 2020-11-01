import { Component } from '@teambit/component';

export class ArtifactStorageError extends Error {
  constructor(private originalError: Error, private component: Component) {
    super(`failed to store artifacts for component ${component.id.toString()}`);
  }
}
