import { ComponentID } from '@teambit/component';
import { BitError } from 'bit-bin/dist/error/bit-error';

export class PkgArtifactNotFound extends BitError {
  constructor(readonly componentId: ComponentID) {
    super(`pkg artifact for component ${componentId.toString()} was not found`);
  }
}
