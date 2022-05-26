import { Location, SchemaNode } from '../schema-node';

/**
 * e.g. `class A { createA(): this {} }`
 */
export class ThisTypeSchema extends SchemaNode {
  constructor(readonly location: Location) {
    super();
  }

  toString() {
    return 'this';
  }
}
