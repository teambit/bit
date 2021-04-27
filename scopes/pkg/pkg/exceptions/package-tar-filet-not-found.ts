import { ComponentID } from '@teambit/component';
import { BitError } from '@teambit/bit-error';

export class PackageTarFiletNotFound extends BitError {
  constructor(readonly componentId: ComponentID) {
    super(`package tar file artifact for component ${componentId.toString()} was not found`);
  }
}
