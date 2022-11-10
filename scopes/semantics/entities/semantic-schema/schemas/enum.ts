import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { schemaObjArrayToInstances, schemaObjToInstance } from '../class-transformers';
import { Location, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';

export class EnumSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;
  @Transform(schemaObjArrayToInstances)
  readonly members: SchemaNode[];

  constructor(
    readonly location: Location,
    readonly name: string,
    members: SchemaNode[],
    readonly signature: string,
    doc?: DocSchema
  ) {
    super();
    this.doc = doc;
    this.members = members;
  }

  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.name)}\n${membersStr}`;
  }
}
