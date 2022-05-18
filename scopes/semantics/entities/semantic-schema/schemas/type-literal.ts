import { Transform } from 'class-transformer';
import { SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../schema-obj-to-class';

/**
 * e.g. `{ a: string; b: number }`
 */
export class TypeLiteralSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly members: SchemaNode[];
  constructor(members: SchemaNode[]) {
    super();
    this.members = members;
  }

  toString() {
    return `{ ${this.members.map((type) => type.toString()).join('; ')} }`;
  }
}
