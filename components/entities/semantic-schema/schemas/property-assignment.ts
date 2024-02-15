import { SchemaNode, SchemaLocation } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';
import { DocSchema } from './docs';

export class PropertyAssignmentSchema extends SchemaNode {
  constructor(
    readonly name: string,
    readonly value: SchemaNode,
    readonly location: SchemaLocation,
    readonly doc?: DocSchema
  ) {
    super();
  }

  toString() {
    return `${this.name}: ${this.value.toString()}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      value: this.value.toObject(),
      doc: this.doc?.toObject(),
      location: this.location,
    };
  }

  static fromObject(obj: Record<string, any>): PropertyAssignmentSchema {
    const name = obj.name;
    const value = SchemaRegistry.fromObject(obj.value);
    const location = obj.location;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new PropertyAssignmentSchema(name, value, location, doc);
  }
}
