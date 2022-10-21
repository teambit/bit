import { Location, SchemaNode } from '../schema-node';

/**
 * needed for better backward and forward compatibility.
 * in case a previous version of the semantic-schema had a schema class that doesn't exist anymore, then it'll be
 * wrapped in this class.
 */
export class UnImplementedSchema extends SchemaNode {
  constructor(readonly location: Location, readonly name: string, readonly type: string) {
    super();
  }

  toString() {
    return `<<unimplemented schema ${this.name} of type ${this.type}>>`;
  }
}
