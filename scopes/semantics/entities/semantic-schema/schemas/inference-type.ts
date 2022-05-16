import { SchemaNode } from '../schema-node';

/**
 * where there is no explicit type, the type is taken from the "quickinfo" of tsserver
 */
export class InferenceTypeSchema implements SchemaNode {
  constructor(private type: string) {}

  toObject() {
    return {
      constructorName: this.constructor.name,
      type: this.type,
    };
  }

  toString() {
    return this.type;
  }
}
