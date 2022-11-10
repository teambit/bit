import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../class-transformers';

export class ExpressionWithTypeArgumentsSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly typeArgs: SchemaNode[];

  @Transform(schemaObjToInstance)
  readonly expression: SchemaNode;

  constructor(typeArgs: SchemaNode[], expression: SchemaNode, readonly name: string, readonly location: Location) {
    super();
    this.typeArgs = typeArgs;
    this.expression = expression;
  }

  toString() {
    return this.name;
  }
}
