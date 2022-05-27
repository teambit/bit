import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

export class IndexedAccessSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly objectType: SchemaNode;
  @Transform(schemaObjToInstance)
  readonly indexType: SchemaNode;
  constructor(readonly location: Location, objectType: SchemaNode, indexType: SchemaNode) {
    super();
    this.objectType = objectType;
    this.indexType = indexType;
  }
  toString() {
    return `${this.objectType.toString()}[${this.indexType.toString()}]`;
  }
}
