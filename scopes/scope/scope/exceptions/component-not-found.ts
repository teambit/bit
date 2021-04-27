import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component';

export class ComponentNotFound extends BitError {
  constructor(
    /**
     * id of the missing component.
     */
    id: ComponentID
  ) {
    super(`component with id: ${id} was not found`);
  }
}
