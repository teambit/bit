import type { Serializable } from '@teambit/toolbox.types.serializable';

export class DocProp {
  constructor(
    /**
     * name of the doc property.
     */
    readonly name: string,

    /**
     * value of the doc property.
     */
    readonly value: Serializable
  ) {}

  getAs<T>() {
    return this.value as T;
  }
}
