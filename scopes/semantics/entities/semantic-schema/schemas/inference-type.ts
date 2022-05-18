import { SchemaNode } from '../schema-node';

/**
 * where there is no explicit type, the type is taken from the "quickinfo" of tsserver
 */
export class InferenceTypeSchema extends SchemaNode {
  constructor(private type: string) {
    super();
  }

  toString() {
    return this.type;
  }
}
