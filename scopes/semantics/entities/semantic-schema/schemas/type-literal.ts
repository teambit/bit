import { SchemaNode } from '../schema-node';

/**
 * e.g. `{ a: string; b: number }`
 */
export class TypeLiteralSchema implements SchemaNode {
  constructor(private members: SchemaNode[]) {}
  toObject(): Record<string, any> {
    return {
      types: this.members.map((type) => type.toObject()),
    };
  }
  toString() {
    return `{${this.members.map((type) => type.toString()).join('; ')}}`;
  }
}
