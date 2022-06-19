import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { schemaObjToInstance } from '../class-transformers';
import { Location, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';

export class EnumSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(readonly location: Location, readonly name: string, readonly members: string[], doc?: DocSchema) {
    super();
    this.doc = doc;
  }

  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.name)}\n${membersStr}`;
  }
}
