import { Transform } from 'class-transformer';
import { SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../schema-obj-to-class';

export class TupleTypeSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly elements: SchemaNode[];
  constructor(elements: SchemaNode[]) {
    super();
    this.elements = elements;
  }

  toString() {
    return `[${this.elements.map((elem) => elem.toString()).join(', ')}]`;
  }
}
