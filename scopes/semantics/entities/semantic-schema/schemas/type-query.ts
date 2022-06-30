import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

/**
 * e.g. `typeof Foo`
 */
export class TypeQuerySchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  constructor(readonly location: Location, type: SchemaNode, readonly signature: string) {
    super();
    this.type = type;
  }
  getSignature() {
    return this.signature;
  }

  toString() {
    return `typeof ${this.type.toString()}`;
  }
}
