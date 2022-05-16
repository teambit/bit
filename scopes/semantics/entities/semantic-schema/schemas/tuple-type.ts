import { SchemaNode } from '../schema-node';

export class TupleTypeSchema implements SchemaNode {
  constructor(private elements: SchemaNode[]) {}
  toObject() {
    return {
      constructorName: this.constructor.name,
      elements: this.elements.map((elem) => elem.toObject()),
    };
  }
  toString() {
    return `[${this.elements.map((elem) => elem.toString()).join(', ')}]`;
  }
}
