import { Location, SchemaNode } from '../schema-node';

export class UnImplementedSchema extends SchemaNode {
  constructor(readonly location: Location, readonly name: string, readonly type: string) {
    super();
  }

  toString() {
    return `<<unimplemented schema ${this.name} of type ${this.type}>>`;
  }
}
