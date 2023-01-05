import { Location, SchemaNode } from '../schema-node';

/**
 * <T>
 */
export class TypeParameterSchema extends SchemaNode {
  constructor(readonly location: Location, readonly name: string) {
    super();
  }

  toString() {
    return this.name;
  }
}
