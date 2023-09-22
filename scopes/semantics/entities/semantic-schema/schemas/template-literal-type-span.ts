import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TemplateLiteralTypeSpanSchema extends SchemaNode {
  type: SchemaNode;

  constructor(readonly location: SchemaLocation, readonly literal: string, type: SchemaNode) {
    super();
    this.type = type;
  }

  getNodes() {
    return [this.type];
  }

  toString() {
    return `${this.type.toString()} ${this.literal}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      literal: this.literal,
      type: this.type.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): TemplateLiteralTypeSpanSchema {
    const location = obj.location;
    const literal = obj.literal;
    const type = SchemaRegistry.fromObject(obj.type);
    return new TemplateLiteralTypeSpanSchema(location, literal, type);
  }
}
