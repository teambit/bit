import { Location, SchemaNode } from '../schema-node';

export class NamedTupleSchema extends SchemaNode {
  constructor(readonly location: Location, readonly type: SchemaNode, readonly name?: string) {
    super();
  }

  toString() {
    return `${this.name}: ${this.type.toString()}`;
  }
}
