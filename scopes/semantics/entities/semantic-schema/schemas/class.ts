import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../class-transformers';
import { DocSchema } from './docs';
import { ExpressionWithTypeArgumentsSchema } from './expression-with-arguments';

export class ClassSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly members: SchemaNode[];

  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(
    readonly name: string,
    members: SchemaNode[],
    readonly location: Location,
    readonly signature: string,
    doc?: DocSchema,
    readonly typeParams?: string[],
    readonly extendsNodes?: ExpressionWithTypeArgumentsSchema[],
    readonly implementNodes?: ExpressionWithTypeArgumentsSchema[]
  ) {
    super();
    this.members = members;
    this.doc = doc;
  }

  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.name)}\n${membersStr}`;
  }
}
