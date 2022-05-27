import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

export class TemplateLiteralTypeSpanSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  type: SchemaNode;
  constructor(readonly location: Location, readonly literal: string, type: SchemaNode) {
    super();
    this.type = type;
  }

  toString() {
    return `${this.type.toString()} ${this.literal}`;
  }
}
