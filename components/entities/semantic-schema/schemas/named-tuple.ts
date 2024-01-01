import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class NamedTupleSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly type: SchemaNode, readonly name?: string) {
    super();
  }

  getNodes() {
    return [this.type];
  }

  toString() {
    return `${this.name}: ${this.type.toString()}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): NamedTupleSchema {
    const location = obj.location;
    const type = SchemaRegistry.fromObject(obj.type);
    const name = obj.name;
    return new NamedTupleSchema(location, type, name);
  }
}
