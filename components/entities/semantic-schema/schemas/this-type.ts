import { SchemaLocation, SchemaNode } from '../schema-node';

/**
 * e.g. `class A { createA(): this {} }`
 */
export class ThisTypeSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly name: string) {
    super();
  }

  toString() {
    return this.name;
  }

  toFullSignature() {
    return this.toString();
  }

  static fromObject(obj: Record<string, any>): ThisTypeSchema {
    const location = obj.location;
    const name = obj.name;
    return new ThisTypeSchema(location, name);
  }
}
