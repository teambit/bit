import { Location, SchemaNode } from '../schema-node';

/**
 * where there is no explicit type, the type is taken from the "quickinfo" of tsserver
 */
export class InferenceTypeSchema extends SchemaNode {
  constructor(readonly location: Location, readonly type: string, readonly name?: string) {
    super();
  }

  toString() {
    if (this.name !== this.type) {
      return `${this.name}: ${this.type}`;
    }
    return this.type;
  }
}
