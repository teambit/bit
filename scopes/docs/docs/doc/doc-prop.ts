import type { Serializable } from '@teambit/types.serializable';

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
}
