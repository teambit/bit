import { Transform } from 'class-transformer';
import { SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../schema-obj-to-class';

export class TypeOperatorSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  type: SchemaNode;
  constructor(readonly operatorName: string, type: SchemaNode) {
    super();
    this.type = type;
  }

  toString() {
    return `${this.operatorName} ${this.type.toString()}`;
  }
}
