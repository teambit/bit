import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

export class ParameterSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  constructor(
    readonly location: Location,
    readonly name: string,
    type: SchemaNode,
    readonly defaultValue?: any,
    readonly description?: string
  ) {
    super();
    this.type = type;
  }

  toString() {
    return `${this.name}: ${this.type.toString()}`;
  }
}
