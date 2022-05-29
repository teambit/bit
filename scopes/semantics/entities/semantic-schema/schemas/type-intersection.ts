import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../class-transformers';

export class TypeIntersectionSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly types: SchemaNode[];
  constructor(readonly location: Location, types: SchemaNode[]) {
    super();
    this.types = types;
  }

  toString() {
    return `${this.types.map((type) => type.toString()).join(' & ')}`;
  }
}
