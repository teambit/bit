import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TupleTypeSchema extends SchemaNode {
  readonly elements: SchemaNode[];

  constructor(readonly location: SchemaLocation, elements: SchemaNode[]) {
    super();
    this.elements = elements;
  }

  toString() {
    return `[${this.elements.map((elem) => elem.toString()).join(', ')}]`;
  }

  toObject() {
    return {
      ...super.toObject(),
      elements: this.elements.map((elem) => elem.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): TupleTypeSchema {
    const location = obj.location;
    const elements = obj.elements.map((elem: any) => SchemaRegistry.fromObject(elem));
    return new TupleTypeSchema(location, elements);
  }
}
