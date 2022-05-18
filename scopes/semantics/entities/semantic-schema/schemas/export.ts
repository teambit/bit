import { SchemaNode } from '../schema-node';

type Primitive = string | number | boolean | null | undefined;
export type StaticProperties = Map<string, Primitive>;

export class Export extends SchemaNode {
  constructor(
    /**
     * named export identifier of the module export.
     */
    readonly identifier: string,

    /**
     * API node.
     */
    readonly nodes?: SchemaNode[],

    /**
     * static properties attached to this export
     * @example
     * export hello = () => {};
     * hello.value = "text"; // <-- staticProperty
     * hello.count = 3; // <-- static property
     */
    readonly staticProperties?: StaticProperties
  ) {
    super();
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      identifier: this.identifier,
    };
  }

  toString() {
    return this.identifier;
  }
}
