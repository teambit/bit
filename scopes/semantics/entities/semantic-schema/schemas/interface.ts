import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../class-transformers';
import { DocSchema } from './docs';

export class InterfaceSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly members: SchemaNode[];

  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(
    readonly location: Location,
    readonly name: string,
    readonly signature: string,
    readonly extendsNodes: SchemaNode[],
    members: SchemaNode[],
    doc?: DocSchema
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
