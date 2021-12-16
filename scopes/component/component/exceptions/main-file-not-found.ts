import { ComponentID } from '@teambit/component-id';

export class MainFileNotFound extends Error {
  constructor(
    /**
     * name of the host.
     */
    readonly id: ComponentID,
    readonly mainFile: string
  ) {
    super();
  }

  toString() {
    return `[component] error: main file ${this.mainFile} for component ${this.id.toString()} was not found`;
  }
}
