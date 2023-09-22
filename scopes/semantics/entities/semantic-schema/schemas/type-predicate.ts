import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

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
  readonly type?: SchemaNode;
  constructor(
    readonly location: SchemaLocation,
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

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type?.toObject(),
      hasAssertsModifier: this.hasAssertsModifier,
    };
  }

  static fromObject(obj: Record<string, any>): TypePredicateSchema {
    const location = obj.location;
    const name = obj.name;
    const type = obj.type ? SchemaRegistry.fromObject(obj.type) : undefined;
    const hasAssertsModifier = obj.hasAssertsModifier;
    return new TypePredicateSchema(location, name, type, hasAssertsModifier);
  }
}
