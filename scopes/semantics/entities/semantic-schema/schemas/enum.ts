import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';

export class EnumSchema extends SchemaNode {
  constructor(readonly location: Location, readonly name: string, readonly members: string[]) {
    super();
  }

  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.name)}\n${membersStr}`;
  }
}
