import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TupleTypeSchema extends SchemaNode {
  readonly elements: SchemaNode[];

  constructor(
    readonly location: SchemaLocation,
    elements: SchemaNode[]
  ) {
    super();
    this.elements = elements;
  }

  toString(options?: { color?: boolean }) {
    return `[${this.elements.map((elem) => elem.toString(options)).join(', ')}]`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    return `[${this.elements.map((elem) => elem.toFullSignature(options)).join(', ')}]`;
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
