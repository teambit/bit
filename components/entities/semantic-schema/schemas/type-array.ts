import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TypeArraySchema extends SchemaNode {
  readonly type: SchemaNode;

  constructor(readonly location: SchemaLocation, type: SchemaNode) {
    super();
    this.type = type;
  }

  getNodes() {
    return [this.type];
  }

  toString() {
    return `${this.type.toString()}[]`;
  }

  toObject() {
    return {
      ...super.toObject(),
      type: this.type.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): TypeArraySchema {
    const location = obj.location;
    const type = SchemaRegistry.fromObject(obj.type);
    return new TypeArraySchema(location, type);
  }
}
