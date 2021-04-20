import { ComponentID } from '@teambit/component';
import { BitError } from '@teambit/bit-error';

export class DistArtifactNotFound extends BitError {
  constructor(readonly componentId: ComponentID) {
    super(`dist artifact for component ${componentId.toString()} was not found`);
  }
}
