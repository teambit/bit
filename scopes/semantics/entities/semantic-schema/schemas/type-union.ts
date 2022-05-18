import { Transform } from 'class-transformer';
import { SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../schema-obj-to-class';

export class TypeUnionSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly types: SchemaNode[];
  constructor(types: SchemaNode[]) {
    super();
    this.types = types;
  }
  toString() {
    return `${this.types.map((type) => type.toString()).join(' | ')}`;
  }
}
