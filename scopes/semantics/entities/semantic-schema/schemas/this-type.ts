import { SchemaLocation, SchemaNode } from '../schema-node';

/**
 * e.g. `class A { createA(): this {} }`
 */
export class ThisTypeSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation) {
    super();
  }

  toString() {
    return 'this';
  }

  static fromObject(obj: Record<string, any>): ThisTypeSchema {
    const location = obj.location;
    return new ThisTypeSchema(location);
  }
}
