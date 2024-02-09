import { SchemaLocation, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';

export class Decorator extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly name: string, readonly doc?: DocSchema) {
    super();
  }

  toString() {
    return `@${this.name}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      doc: this.doc?.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): Decorator {
    const location = obj.location;
    const name = obj.name;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new Decorator(location, name, doc);
  }
}
