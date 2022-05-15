import { SchemaNode } from '../schema-node';

/**
 * e.g. `typeof Foo`
 */
export class TypeQuerySchema implements SchemaNode {
  constructor(private type: SchemaNode, private signature: string) {}
  getSignature() {
    return this.signature;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      type: this.type,
      signature: this.signature,
    };
  }

  toString() {
    return `typeof ${this.type.toString()}`;
  }
}
