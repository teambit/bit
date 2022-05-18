import { Transform } from 'class-transformer';
import { SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../schema-obj-to-class';

/**
 * e.g. `typeof Foo`
 */
export class TypeQuerySchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  constructor(type: SchemaNode, readonly signature: string) {
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
