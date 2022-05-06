import { SchemaNode } from '../schema-node';

export class TypeIntersectionSchema implements SchemaNode {
  constructor(private types: SchemaNode[]) {}
  toObject(): Record<string, any> {
    return {
      types: this.types.map((type) => type.toObject()),
    };
  }
  toString() {
    return `${this.types.map((type) => type.toString()).join(' & ')}`;
  }
}
