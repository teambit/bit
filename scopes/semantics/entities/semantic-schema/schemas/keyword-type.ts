import { Location, SchemaNode } from '../schema-node';

/**
 * e.g. 'string', 'boolean', etc.
 */
export class KeywordTypeSchema extends SchemaNode {
  constructor(readonly location: Location, readonly name: string) {
    super();
  }

  toString() {
    return this.name;
  }
}
