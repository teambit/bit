import { SchemaNode } from '../schema-node';

/**
 * e.g. `{ a: string; b: number }`
 */
export class TypeLiteralSchema implements SchemaNode {
  constructor(private members: SchemaNode[]) {}
  toObject() {
    return {
      constructorName: this.constructor.name,
      types: this.members.map((type) => type.toObject()),
    };
  }
  toString() {
    return `{ ${this.members.map((type) => type.toString()).join('; ')} }`;
  }
}
