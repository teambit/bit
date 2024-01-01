import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class ExpressionWithTypeArgumentsSchema extends SchemaNode {
  readonly typeArgs: SchemaNode[];
  readonly expression: SchemaNode;

  constructor(
    typeArgs: SchemaNode[],
    expression: SchemaNode,
    readonly name: string,
    readonly location: SchemaLocation
  ) {
    super();
    this.typeArgs = typeArgs;
    this.expression = expression;
  }

  toString() {
    return this.name;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      location: this.location,
      typeArgs: this.typeArgs.map((typeArg) => typeArg.toObject()),
      expression: this.expression,
    };
  }

  static fromObject(obj: Record<string, any>): ExpressionWithTypeArgumentsSchema {
    const name = obj.name;
    const location = obj.location;
    const typeArgs = obj.typeArgs.map((typeArg: any) => SchemaRegistry.fromObject(typeArg));
    const expression = SchemaRegistry.fromObject(obj.expression);
    return new ExpressionWithTypeArgumentsSchema(typeArgs, expression, name, location);
  }
}
