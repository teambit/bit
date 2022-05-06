import chalk from 'chalk';
import { SchemaNode } from '../schema-node';

export class InterfaceSchema implements SchemaNode {
  constructor(private name: string, private members: SchemaNode[]) {}
  toObject(): Record<string, any> {
    return {
      name: this.name,
      types: this.members.map((type) => type.toObject()),
    };
  }
  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.name)}\n${membersStr}`;
  }
}
