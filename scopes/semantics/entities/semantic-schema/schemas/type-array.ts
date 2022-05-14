import { SchemaNode } from '../schema-node';

export class TypeArraySchema implements SchemaNode {
  constructor(private type: SchemaNode) {}
  toObject() {
    return {
      constructorName: this.constructor.name,
      type: this.type.toObject(),
    };
  }
  toString() {
    return `${this.type.toString()}[]`;
  }
}
