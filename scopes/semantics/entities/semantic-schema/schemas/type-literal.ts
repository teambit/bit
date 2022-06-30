import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../class-transformers';

/**
 * e.g. `{ a: string; b: number }`
 */
export class TypeLiteralSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly members: SchemaNode[];
  constructor(readonly location: Location, members: SchemaNode[]) {
    super();
    this.members = members;
  }

  toString() {
    return `{ ${this.members.map((type) => type.toString()).join('; ')} }`;
  }
}
