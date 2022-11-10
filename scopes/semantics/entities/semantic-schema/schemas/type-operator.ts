import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

export class TypeOperatorSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  type: SchemaNode;
  constructor(readonly location: Location, readonly name: string, type: SchemaNode) {
    super();
    this.type = type;
  }

  toString() {
    return `${this.name} ${this.type.toString()}`;
  }
}
