import { Location, SchemaNode } from '../schema-node';

/**
 * e.g. const a: 'a';
 */
export class LiteralTypeSchema extends SchemaNode {
  constructor(readonly location: Location, readonly name: string) {
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
