import { Transform } from 'class-transformer';
import { SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../schema-obj-to-class';

export class ParameterSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  constructor(readonly name: string, type: SchemaNode, readonly defaultValue?: any, readonly description?: string) {
    super();
    this.type = type;
  }

  toString() {
    return `${this.name}: ${this.type.toString()}`;
  }
}
