import { SchemaNode } from '../schema-node';

/**
 * e.g. 'string', 'boolean', etc.
 */
export class KeywordTypeSchema implements SchemaNode {
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
