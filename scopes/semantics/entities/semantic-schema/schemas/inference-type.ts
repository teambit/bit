import { Location, SchemaNode } from '../schema-node';

/**
 * where there is no explicit type, the type is taken from the "quickinfo" of tsserver
 */
export class InferenceTypeSchema extends SchemaNode {
  constructor(readonly location: Location, readonly type: string) {
    super();
  }

  toString() {
    return this.type;
  }
}
