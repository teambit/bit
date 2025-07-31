import { BitError } from '@teambit/bit-error';
import type { ComponentID } from '@teambit/component';

export class PreviewArtifactNotFound extends BitError {
  constructor(componentId: ComponentID) {
    super(`preview for component ${componentId.toString()} was not found`);
  }
}
