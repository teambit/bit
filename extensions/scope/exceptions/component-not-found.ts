import { ComponentID } from '../../component';

export class ComponentNotFound extends Error {
  constructor(
    /**
     * id of the missing component.
     */
    private id: ComponentID
  ) {
    super();
  }

  toString() {
    return `component with id: ${this.id} was not found`;
  }
}
