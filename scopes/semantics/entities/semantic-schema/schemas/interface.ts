import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../class-transformers';
import { DocSchema } from './docs';
import { ExpressionWithTypeArgumentsSchema } from './expression-with-arguments';

export class InterfaceSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly members: SchemaNode[];

  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(
    readonly location: Location,
    readonly name: string,
    readonly signature: string,
    readonly extendsNodes: ExpressionWithTypeArgumentsSchema[],
    members: SchemaNode[],
    doc?: DocSchema,
    readonly typeParams?: string[]
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
