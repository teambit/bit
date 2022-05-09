import chalk from 'chalk';
import { SchemaNode } from '../schema-node';

export class ClassSchema implements SchemaNode {
  constructor(readonly className: string, readonly members: SchemaNode[]) {}

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.className,
      members: this.members.map((member) => member.toObject()),
    };
  }

  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.className)}\n${membersStr}`;
  }
}
