import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

export class AliasSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly schema: SchemaNode;

  constructor(schema: SchemaNode, readonly name: string, readonly location: Location) {
    super();
    this.schema = schema;
  }

  toString() {
    return `${chalk.bold(this.name)}: ${this.schema.toString()}`;
  }
}
