import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../class-transformers';

export class InterfaceSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly members: SchemaNode[];
  constructor(readonly location: Location, readonly name: string, members: SchemaNode[]) {
    super();
    this.members = members;
  }

  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.name)}\n${membersStr}`;
  }
}
