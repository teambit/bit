import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../class-transformers';

export class TupleTypeSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly elements: SchemaNode[];
  constructor(readonly location: Location, elements: SchemaNode[]) {
    super();
    this.elements = elements;
  }

  toString() {
    return `[${this.elements.map((elem) => elem.toString()).join(', ')}]`;
  }
}
