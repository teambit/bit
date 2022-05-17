import { SchemaNode } from '../schema-node';

/**
 * e.g. const a: 'a';
 */
export class LiteralTypeSchema implements SchemaNode {
  constructor(private name: string) {}

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.name,
    };
  }

  toString() {
    return this.name;
  }
}
