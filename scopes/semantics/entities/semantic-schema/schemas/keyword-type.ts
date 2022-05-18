import { SchemaNode } from '../schema-node';

/**
 * e.g. 'string', 'boolean', etc.
 */
export class KeywordTypeSchema extends SchemaNode {
  constructor(private name: string) {
    super();
  }

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
