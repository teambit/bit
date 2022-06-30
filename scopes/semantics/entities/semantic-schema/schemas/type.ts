import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';
import { DocSchema } from './docs';

export class TypeSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;

  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(
    readonly location: Location,
    readonly name: string,
    type: SchemaNode,
    readonly signature: string,
    doc?: DocSchema
  ) {
    super();
    this.type = type;
    this.doc = doc;
  }

  toString() {
    return `${chalk.bold(this.name)}: ${this.type.toString()}`;
  }
}
