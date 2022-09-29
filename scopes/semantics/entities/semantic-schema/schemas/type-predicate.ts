import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

/**
 * e.g. `function f(str: any): str is string {}`
 *
 * example when the type is empty:
 * ```ts
 * function assert(condition: any, msg?: string): asserts condition {
 *  if (!condition) {
 *   throw new AssertionError(msg);
 *  }
 * }
 * ```
 *
 */
export class TypePredicateSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type?: SchemaNode;
  constructor(
    readonly location: Location,
    readonly name: string,
    type?: SchemaNode,
    readonly hasAssertsModifier = false
  ) {
    super();
    this.type = type;
  }

  toString() {
    const assertsKeyword = this.hasAssertsModifier ? 'asserts ' : '';
    const typeStr = this.type ? ` is ${this.type.toString()}` : '';
    return assertsKeyword + this.name + typeStr;
  }
}
